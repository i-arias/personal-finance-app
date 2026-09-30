# CLAUDE.md — Finanzas personales

> Archivo de contexto para Claude Code. Léelo completo al inicio de cada sesión.
> Actualiza la sección **Progreso** y los checkboxes al terminar cada tarea.

---

## 1. Contexto

Aplicación web personal para registrar y analizar mis gastos. Soy un solo usuario y vivo en **Colombia**. Pago casi todo (≈99 %) con **Apple Pay**, usando varias tarjetas de distintos bancos. A veces hago **transferencias** (Bre-B, Nequi, apps de los bancos).

Dispositivos:
- **iPhone**: registro automático y consulta rápida.
- **PC con Windows**: desarrollo y análisis.

Objetivos, en orden de prioridad:
1. Que cada pago con Apple Pay quede registrado **automáticamente**, sin que yo haga nada.
2. Registrar las transferencias con el mínimo esfuerzo.
3. Tener dashboards claros de en qué se me va la plata.

No soy desarrollador experto. Explícame las decisiones en español y guíame paso a paso en todo lo que deba hacer a mano.

---

## 2. Restricciones (no negociables)

- **Costo cero.** Solo planes gratuitos. No propongas servicios que exijan plan pago. Si algo lo requiere, detente y avísame.
- **Sin servidor propio.** No tengo ningún equipo encendido 24/7.
- **Datos privados.** Solo yo puedo ver la app y sus datos.
- **Sin datos reales en el repositorio**: ni en tests, ni en seeds, ni en backups versionados.

---

## 3. Stack

| Capa | Tecnología |
|---|---|
| Hosting + API | Un solo **Cloudflare Worker** con *static assets*: frontend y API en el mismo despliegue |
| API | TypeScript + **Hono**, con validación en **Zod** |
| Base de datos | **Cloudflare D1** (SQLite), con migraciones de Wrangler |
| Frontend | **React + Vite + TypeScript**, **Tailwind CSS**, **React Router** (modo declarativo); gráficos con **Recharts** |
| App en el iPhone | **PWA** instalable ("Agregar a pantalla de inicio") |
| Login | **Cloudflare Access** (gratis; solo mi correo tiene acceso) |
| Automatización | **Atajos de iOS** (Shortcuts) que llaman a la API |
| Tests | **Vitest**, con `@cloudflare/vitest-plugin` para probar la API en el runtime de Workers |

### Límites del plan gratis

Verifica en la documentación que sigan vigentes:
- **Workers**: ~100.000 peticiones/día y 10 ms de CPU por petición.
- **D1**: 5 M filas leídas/día, 100.000 filas escritas/día y 5 GB de almacenamiento.
  - Desde el 1-sep-2026, si se supera el límite diario las consultas fallan hasta la medianoche UTC.

Para no acercarnos a esos límites:
- Crea índices en las columnas por las que se filtra.
- Haz las agregaciones en SQL.
- Nunca recorras la tabla completa para calcular estadísticas.

> **Importante:** antes de configurar Wrangler, Access o el scaffolding, consulta la documentación **actual** de Cloudflare. Estas herramientas cambian seguido.

---

## 4. Arquitectura

```
iPhone: Atajo Apple Pay ─┐
iPhone: SMS / captura ───┼──► Worker  /api/ingest/*  ──► D1
Formulario web ──────────┘        │
                                  └── /api/*  ◄── Frontend React (PC y iPhone)

Todo el Worker está detrás de Cloudflare Access.
```

---

## 5. Estructura del repositorio

Basada en la plantilla oficial `vite-react-template` de Cloudflare.

```
/
├─ CLAUDE.md
├─ wrangler.jsonc             # config del Worker; binding D1 llamado "DB"
├─ vite.config.ts             # React + Tailwind + plugin de Cloudflare
├─ vitest.config.ts           # tests en el runtime de Workers
├─ migrations/                # SQL de D1 (0001_init.sql, ...)
├─ public/                   # manifest.webmanifest e íconos de la PWA
├─ src/
│  ├─ shared/                 # usado por la API y el frontend
│  │  ├─ api.ts               # tipos de la API (Transaction, Category, …)
│  │  ├─ labels.ts            # textos en español de tipos, estados y fuentes
│  │  ├─ money.ts             # parseo y formato de montos
│  │  └─ dates.ts             # zona horaria America/Bogota
│  ├─ worker/                 # API
│  │  ├─ index.ts             # app Hono; monta las rutas
│  │  ├─ auth.ts              # verificación del token de Access
│  │  ├─ types.ts             # tipos de Hono (bindings y variables)
│  │  ├─ routes/              # transactions, categories, accounts, rules, export (luego stats, ingest)
│  │  └─ lib/
│  │     ├─ http.ts           # validación con Zod y respuestas de error
│  │     ├─ text.ts           # normalizeText: sin tildes, mayúsculas ni espacios repetidos
│  │     ├─ categorize.ts     # aplica las reglas
│  │     ├─ dedupe.ts         # hash SHA-256 para dedupe_key
│  │     └─ parsers/          # un parser por banco para SMS y correo
│  └─ react-app/              # frontend React
│     ├─ api.ts               # fetch a la API; detecta la sesión vencida de Access
│     ├─ catalog.tsx          # categorías y cuentas compartidas por todas las pantallas
│     ├─ components/          # formulario de movimientos, barra inferior, UI común
│     └─ pages/               # una pantalla por ruta
├─ test/
├─ scripts/                   # backup; accounts.local.sql (mis cuentas, fuera de git) y su .example
└─ docs/                      # guías paso a paso para mí (Cloudflare, D1, iPhone, Atajos, backups)
```

---

## 6. Modelo de datos

```sql
CREATE TABLE accounts (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,              -- "Visa Bancolombia", "Nequi"
  institution      TEXT,                       -- "Bancolombia"
  type             TEXT NOT NULL CHECK (type IN ('credit_card','debit_card','savings','wallet','cash')),
  wallet_card_name TEXT,                       -- nombre EXACTO que muestra Apple Wallet
  currency         TEXT NOT NULL DEFAULT 'COP',
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categories (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('expense','income','internal')),
  color          TEXT,
  monthly_budget INTEGER                        -- en pesos; opcional
);

CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  occurred_at  TEXT NOT NULL,                   -- ISO 8601 con offset, ej. 2026-10-01T13:45:00-05:00
  local_date   TEXT NOT NULL,                   -- YYYY-MM-DD en hora de Bogotá (para agrupar)
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),  -- centavos; siempre positivo
  currency     TEXT NOT NULL DEFAULT 'COP',
  type         TEXT NOT NULL CHECK (type IN ('expense','income','internal')),
  merchant_raw TEXT,                            -- tal como llegó
  merchant     TEXT,                            -- nombre limpio
  category_id  INTEGER REFERENCES categories(id),
  account_id   INTEGER REFERENCES accounts(id),
  source       TEXT NOT NULL CHECK (source IN ('apple_pay','sms','email','receipt','manual','csv')),
  status       TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','review')),
  note         TEXT,
  raw_payload  TEXT,                            -- JSON o texto original (para depurar parsers)
  dedupe_key   TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tx_local_date ON transactions(local_date);
CREATE INDEX idx_tx_category   ON transactions(category_id, local_date);
CREATE INDEX idx_tx_account    ON transactions(account_id, local_date);
CREATE INDEX idx_tx_status     ON transactions(status);

CREATE TABLE rules (
  id            INTEGER PRIMARY KEY,
  pattern       TEXT NOT NULL,                  -- texto a buscar (sin distinguir mayúsculas ni tildes)
  merchant_name TEXT,                           -- nombre limpio a asignar
  category_id   INTEGER REFERENCES categories(id),
  type          TEXT CHECK (type IN ('expense','income','internal')),
  priority      INTEGER NOT NULL DEFAULT 100    -- gana el número menor
);
```

### Categorías iniciales

Se cargan con el seed y se pueden editar desde la app.

- **Gastos**:
  - Mercado
  - Restaurantes y domicilios
  - Transporte (taxi/app, gasolina, peajes, parqueadero)
  - Vivienda (arriendo, administración)
  - Servicios públicos
  - Celular e internet
  - Salud y droguería
  - Suscripciones
  - Compras y ropa
  - Entretenimiento
  - Educación
  - Viajes
  - Cuidado personal
  - Mascotas
  - Regalos
  - Impuestos y comisiones (4x1000, cuotas de manejo)
  - Transferencias a personas
  - Otros
- **Ingresos**: Salario, Otros ingresos.
- **Internos**: Pago de tarjeta de crédito, Movimiento entre mis cuentas.

---

## 7. Reglas de negocio

### 7.1 Moneda y montos

- La moneda base es **COP**. Los montos se guardan en `amount_minor` como enteros (centavos). **Nunca floats.**
- Formato para mostrar: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`, que da `$ 25.000`.
- `parseAmount(text)` debe aceptar tanto el formato colombiano como el estadounidense, porque iOS puede entregar cualquiera de los dos según la configuración regional.

Casos que deben pasar en los tests:

| Entrada | Resultado |
|---|---|
| `$25.000` | 25000 COP |
| `$ 25.000,00` | 25000 COP |
| `COP 1.234.567` | 1234567 COP |
| `$25,000.00` | 25000 COP |
| `US$12.99` | 12.99 USD |
| `USD 12,99` | 12.99 USD |
| `12.5` | 12.5 |
| `""` o `0` | inválido → `status = 'review'` |

**Regla de separadores:**
- Si el último separador (`.` o `,`) va seguido de 1 o 2 dígitos al final, es el separador decimal.
- Si va seguido de exactamente 3 dígitos, es separador de miles.
- Los demás separadores siempre son de miles.

**Compras en USD:** se guardan en USD. En la fase 7 se agrega la opción de registrar el valor en COP que cobró el banco.

### 7.2 Fechas

- La zona horaria es **America/Bogota** (UTC−5, sin horario de verano).
- El Worker corre en UTC, así que `local_date` se calcula **siempre** en hora de Bogotá. Si no, las compras hechas después de las 7 p. m. quedan registradas en el día siguiente.

### 7.3 Tipos de movimiento: evitar contar doble

- `expense`: gasto real.
- `income`: ingreso (salario, reembolsos).
- `internal`: dinero que pasa entre mis propias cuentas, por ejemplo:
  - **el pago de la tarjeta de crédito**;
  - traslados entre mis cuentas;
  - recargas a Nequi desde mi banco.

Los `internal` **nunca cuentan como gasto** en los dashboards.

Ejemplo: compro $100.000 con Apple Pay usando la tarjeta de crédito (gasto) y después pago la tarjeta por transferencia (interno). Si ambos contaran como gasto, el total quedaría duplicado.

### 7.4 Categorización automática

- La tabla `rules` define la categorización: si `merchant_raw` contiene el patrón, se asignan el nombre limpio, la categoría y el tipo. Si varias reglas coinciden, gana la de menor `priority`.
- Si ninguna regla aplica, el movimiento queda en la categoría "Otros" con `status = 'review'`.
- Cuando corrijo la categoría de un movimiento en la UI, la app me ofrece "Crear regla para este comercio".

### 7.5 Nada se pierde

- Todo lo que llega a `/api/ingest/*` se guarda, aunque no se entienda: queda con `status = 'review'` y con el `raw_payload` original.
- La app tiene una bandeja **"Por revisar"**.
- Si llegan el monto en 0 o el comercio vacío (la automatización de Apple Pay a veces los envía así), el movimiento se guarda con `review` en vez de devolver un error.

### 7.6 Duplicados

- `dedupe_key` es un hash de: source, account, amount_minor, merchant_raw normalizado y occurred_at redondeado al minuto.
- Al importar un CSV del banco (fase 7), un registro se marca como posible duplicado si coincide con uno existente en cuenta, monto exacto y fecha (con ±1 día de margen).

---

## 8. API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Chequeo de estado |
| GET / POST | `/api/transactions` | Listar (filtros: `from`, `to`, `account_id`, `category_id`, `type`, `status`, `q`; paginado con `limit` y `cursor`) / crear |
| GET / PATCH / DELETE | `/api/transactions/:id` | Consultar / editar / borrar |
| CRUD | `/api/categories`, `/api/accounts`, `/api/rules` | Administración |
| GET | `/api/stats/summary?month=YYYY-MM` | Total, variación vs. mes anterior, promedio diario, proyección a fin de mes |
| GET | `/api/stats/by-category?from&to` | Gasto por categoría |
| GET | `/api/stats/monthly?months=12` | Evolución mensual |
| GET | `/api/stats/top-merchants?from&to&limit=10` | Principales comercios |
| GET | `/api/stats/by-account?from&to` | Gasto por tarjeta/cuenta |
| GET | `/api/export.csv?from&to` | Exportar movimientos |
| POST | `/api/ingest/apple-pay` | Llamado desde el Atajo de Apple Pay |
| POST | `/api/ingest/text` | Texto de SMS, correo o comprobante (`source`: `sms` / `email` / `receipt`) |
| POST | `/api/import/csv` | Importar extracto bancario (fase 7) |

Las rutas `/api/ingest/*` responden `{ ok, id, status, summary }`. `summary` es un texto corto que el iPhone muestra como notificación, por ejemplo `"$ 25.000 · Rappi · Domicilios"`.

Convenciones (Fase 3):
- JSON en `snake_case`, igual que las columnas de D1. Los tipos están en `src/shared/api.ts`.
- Éxito: se devuelve el recurso (o la lista) directamente; `DELETE` responde `{ ok: true }`.
- Error: `{ ok: false, error, message }`, con `message` en español. 400 si los datos no son válidos, 404 si no existe, 409 si hay conflicto (nombre repetido, categoría o cuenta en uso).
- Los montos se envían como texto (`amount`) y los interpreta `parseAmount`. Las fechas se envían en ISO 8601; sin zona horaria se asume hora de Bogotá.
- El listado de movimientos devuelve `{ items, next_cursor, totals }`. `totals` (suma por tipo y moneda) solo viene en la primera página.

---

## 9. Seguridad

- **Cloudflare Access** protege **todo** el Worker. Se activa en *Workers & Pages → personal-finance → Access → Protect this Worker behind Access*, con alcance *All traffic* y la política *Cloudflare account* (nunca *Email domain* con `gmail.com`). Pasos completos en `docs/cloudflare-setup.md`.
  - Requiere una organización Zero Trust en plan **Free**. Cloudflare exige registrar un medio de pago (tarjeta o PayPal) aunque el costo sea $0.
- Los Atajos no pueden hacer login interactivo. Por eso usan un **Service Token** de Access (headers `CF-Access-Client-Id` y `CF-Access-Client-Secret`), autorizado en la política con la acción "Service Auth".
  - El JWT de un Service Token no trae `email`: trae el Client ID en `common_name`. El Worker lo acepta si está en `ACCESS_SERVICE_TOKENS` (var de `wrangler.jsonc`), y **solo** para `/api/ingest/*`.
  - El token dura 1 año y se renueva en Zero Trust (ver `docs/atajo-apple-pay.md`).
- Además, `/api/ingest/*` exige el header `X-Ingest-Key`, que debe coincidir con el secreto `INGEST_KEY` (se crea con `wrangler secret put INGEST_KEY`). Se compara en tiempo constante.
- El Worker verifica la identidad que entrega Access y rechaza todo lo que no venga autenticado.
  - Valida el JWT del header `Cf-Access-Jwt-Assertion` con `jose`: firma, `iss` = `ACCESS_TEAM_DOMAIN`, `aud` = `ACCESS_AUD`, y que el correo esté en `ALLOWED_EMAILS` (vars de `wrangler.jsonc`).
  - No se usa `ctx.access`: según la documentación, no funciona en Workers con static assets.
  - En local solo se permite saltar esta verificación si `.dev.vars` tiene `DEV_BYPASS_AUTH=true` **y** la petición llega a `localhost`.
- Las consultas a D1 van siempre con `prepare().bind()`. Nunca se concatena SQL.
- `.gitignore` debe incluir: `.dev.vars`, `.wrangler/`, `backups/`, `node_modules/`.
- El repositorio de GitHub es **privado**.

---

## 10. Automatizaciones en el iPhone

Claude Code no puede crear atajos. Para cada uno, escribe una guía en `docs/` con:
- los pasos exactos en la app Atajos;
- el JSON que debe enviar;
- cómo probarlo.

Los nombres de las acciones en español pueden variar: descríbelas por lo que hacen.

### 10.1 Apple Pay (principal)

Guía completa: `docs/atajo-apple-pay.md`.

1. En Atajos → Automatización → **Wallet** (en iOS 26; antes se llamaba **Transacción**), selecciona todas las tarjetas y todas las categorías. La automatización entrega Transacción, Tarjeta, Comercio, Importe y Nombre.
2. Elige **Ejecutar inmediatamente** y desactiva la notificación de ejecución.
3. Acciones del atajo:
   - Tomar el comercio, el monto y la tarjeta que entrega la transacción.
   - "Obtener contenido de URL": POST con JSON a `/api/ingest/apple-pay`, con los 3 headers de seguridad.
   - Mostrar una notificación con el `summary` que devuelve la API.

Payload de ejemplo:

```json
{
  "merchant": "RAPPI COLOMBIA",
  "amount_text": "$25.000,00",
  "card": "Visa Bancolombia",
  "occurred_at": "2026-10-01T13:45:00-05:00"
}
```

- El campo `card` se mapea con `accounts.wallet_card_name`.
- **Limitaciones conocidas:**
  - Solo se dispara con pagos de Apple Pay.
  - Si un pago se rechaza, la transacción igual puede llegar, así que editar y borrar debe ser fácil.
  - La app Wallet debe tener los datos móviles activados.
- **Sin conexión el atajo falla.** Mejora futura: guardar el pago en un archivo de iCloud y tener un atajo "Reenviar pendientes".

### 10.2 Transferencias

Atajos **no puede leer** las notificaciones push de las apps bancarias. Opciones, en orden de preferencia:

1. **SMS del banco.** Automatización **Mensaje** que se dispara cuando el texto contiene una frase propia del banco (por ejemplo, "Transferiste"). Se filtra por contenido porque los códigos cortos de los bancos no se pueden guardar como contacto. El atajo envía el texto completo a `/api/ingest/text` con `source: "sms"`.
2. **Correo del banco.** Automatización de **Correo** en la app Mail (o Google Apps Script sobre Gmail). Usa el mismo endpoint con `source: "email"`.
3. **Captura del comprobante.** Atajo en la hoja de compartir: "Extraer texto de la imagen" y enviar el resultado al mismo endpoint con `source: "receipt"`.
4. **Registro manual.** Atajo "Registrar gasto" (pide monto, categoría de una lista y nota), accesible desde la pantalla de inicio o el botón de acción.

Parsers:
- Hay uno por banco en `worker/lib/parsers/`, cada uno con tests basados en los ejemplos de la sección 14.
- Si ningún parser reconoce el texto, el movimiento queda en `review`.

---

## 11. Dashboards

- **Resumen del mes**: total gastado, comparación con el mes anterior, promedio diario y proyección a fin de mes.
- **Gasto por categoría**: barras horizontales ordenadas de mayor a menor, con monto y %. Al tocar una categoría se ven sus movimientos. (Iba a ser una dona; se cambió el 2026-09-29 porque con 18 categorías no se lee.)
- **Evolución de los últimos 12 meses**: barras apiladas por categoría.
- **Top 10 comercios del mes.**
- **Gasto por tarjeta/cuenta.**
- **Presupuesto vs. real** por categoría: barras de progreso que se ponen rojas al superar el 100 %.
- **Filtros**: rango de fechas, cuenta y categoría. Los `internal` siempre quedan fuera de los gastos.
- **Diseño mobile-first**: en el iPhone, lo primero que veo es el total del mes y la bandeja "Por revisar".

Cómo quedó (Fase 4):
- **Inicio** (`/`): selector de mes, total en grande, comparación con el mes anterior hasta el mismo día (▲ rojo si gasto más, ▼ verde si gasto menos), promedio diario, proyección (solo el mes en curso), enlace a "Por revisar" (de todos los meses) y presupuesto vs. real.
  - Presupuesto: verde normal, amarillo desde el 90 %, rojo al pasar del 100 %, siempre con ícono y texto.
- **Análisis** (`/analisis`): los 12 meses arriba (no dependen del selector); debajo, el selector de mes, y por categoría, top 10 comercios y por cuenta.
- Reglas de visualización (skill `dataviz`):
  - Las barras de una sola serie usan el verde de la app.
  - Los 12 meses usan la paleta categórica de referencia en orden fijo: azul `#2a78d6`, naranja `#eb6834`, aguamarina `#1baf7a`, amarillo `#eda100` y rosado `#e87ba4` para las 5 categorías con más gasto del año; el resto va como "Otras" en gris `#c3c2b7`.
  - Paleta validada sobre blanco. Como 3 tonos quedan bajo 3:1 de contraste, siempre hay leyenda y "Ver tabla".
  - Nunca más de 5 colores + "Otras"; nunca doble eje.
  - La columna `categories.color` no se usa por ahora.
- Solo suman gastos en COP; las compras en USD se muestran aparte hasta la Fase 7.

---

## 12. Plan por fases

Trabaja **una fase a la vez**:
1. Al empezar una fase, muéstrame el plan antes de escribir código.
2. Al terminarla, haz deploy y explícame cómo probarla.
3. Espera mi visto bueno antes de seguir.

### Fase 0 — Preparación (me guías, lo hago yo)
- [x] Node.js LTS, Git para Windows y Claude Code instalados
- [x] Cuentas gratuitas de Cloudflare y GitHub
- [x] `npx wrangler login` funcionando
- [x] Repositorio privado creado, con este archivo en la raíz

### Fase 1 — Esqueleto desplegado
- [x] Scaffold de Worker + static assets + React/Vite + Hono (usar la plantilla oficial vigente de `create-cloudflare` si sirve)
- [x] Endpoint `/api/health`
- [x] Deploy a `*.workers.dev`
- [x] Access activado y probado: solo entra mi correo (probar desde el iPhone en modo incógnito)
- [x] Scripts de npm: `dev`, `deploy`, `test`, `db:migrate:local`, `db:migrate:remote`
- [x] Guía `docs/cloudflare-setup.md`

### Fase 2 — Base de datos
- [x] Crear la base D1 y el binding `DB`
- [x] Migración `0001_init.sql` (sección 6) y seed de categorías
- [x] Cargar mis cuentas y tarjetas (datos de la sección 14)
- [x] `money.ts` y `dates.ts`, con tests (tabla de la sección 7.1)

### Fase 3 — Registro manual y listado
- [x] CRUD de movimientos, categorías, cuentas y reglas
- [x] Formulario rápido para el celular: el monto va primero y abre el teclado numérico
- [x] Lista con filtros, edición y borrado
- [x] Exportar a CSV
- [x] PWA: manifest e íconos; se abre a pantalla completa

### Fase 4 — Dashboards
- [x] Endpoints de `/api/stats/*`
- [x] Vistas de la sección 11

### Fase 5 — Apple Pay automático
- [x] `/api/ingest/apple-pay` con categorización, dedupe y bandeja "Por revisar"
- [ ] Service Token de Access y secreto `INGEST_KEY`
- [x] Guía `docs/atajo-apple-pay.md`
- [ ] Prueba con una compra real: pegar el payload real (anonimizado) en la sección 14 y ajustar el parser

### Fase 6 — Transferencias
- [ ] `/api/ingest/text` y parsers por banco (con mis ejemplos)
- [ ] Atajos de SMS, captura de comprobante y registro manual, cada uno con su guía en `docs/`

### Fase 7 — Robustez y extras
- [ ] `npm run backup`: `wrangler d1 export` hacia `backups/` (fuera de git), más una guía de restauración
- [ ] Importar extractos CSV/Excel del banco, con detección de duplicados
- [ ] Presupuestos mensuales y alertas
- [ ] Compras en USD: registrar el valor final cobrado en COP
- [ ] Reenvío de pendientes cuando el atajo falla por falta de conexión

---

## 13. Convenciones de trabajo

- **Idioma**:
  - Háblame y escribe la documentación en **español**.
  - El código (variables, funciones, tablas) va en **inglés**.
  - Los textos de la interfaz van en español de Colombia.
  - Mi iPhone está en **inglés**: en las guías del iPhone (Atajos, Ajustes, Wallet), las explicaciones van en español, pero los botones y menús se nombran **en inglés y en negrita**, tal como aparecen en pantalla. Ej.: "Toca **Automation** → **New Automation**".
- **Windows**: desarrollo en PowerShell. Los scripts deben funcionar ahí; prefiere scripts de npm sobre comandos de bash.
- **Commits**: pequeños, uno por tarea terminada, con mensaje descriptivo en español.
- **Dependencias**: no agregues ninguna sin explicarme para qué sirve.
- **Tests obligatorios** para parsers, montos, fechas, categorización y dedupe, siempre con datos ficticios.
- **Cambios de plan**: si algo resulta inviable o hay una forma claramente mejor, dímelo antes de desviarte.
- **Progreso**: al cerrar cada tarea, actualiza la sección Progreso y los checkboxes.

---

## 14. Ejemplos reales (anonimizados) — los completo yo

Antes de pegar cualquier ejemplo aquí, cambia nombres, últimos dígitos y números de referencia.

### Mis cuentas y tarjetas

Las cuentas reales **no van aquí**: están en `scripts/accounts.local.sql` (fuera de git) y en D1. Consultarlas con:

```powershell
npx wrangler d1 execute DB --remote --command "SELECT id, name, institution, type, wallet_card_name FROM accounts"
```

### Payload de Apple Pay

```
(pegar después de la primera prueba real)
```

### SMS de transferencias

```
Banco:
Texto:
```

### Correos de los bancos

```
Banco:
Asunto:
Cuerpo:
```

---

## Progreso

> Esta es la copia pública del proyecto: se quitaron las notas personales de progreso (correos, URL, cuentas e infraestructura).

- **Estado:** fases 0 a 4 completas. La Fase 5 (Apple Pay automático) está implementada y en validación con compras reales.
- **Notas técnicas:**
  - Fase 3: la PWA no usa service worker. El manifest lleva `crossorigin="use-credentials"` porque todo está detrás de Access. iOS no abre el teclado automáticamente, así que el monto queda de primero.
  - Fase 4: Recharts va en un archivo aparte (`React.lazy`) que solo se descarga al abrir Análisis; la animación está desactivada.
  - Fase 5: `/api/ingest/apple-pay` guarda todo lo que llega. Queda "Por revisar" si falta el monto, el comercio, la tarjeta o una regla con categoría; sin regla, la categoría es "Otros". Responde `{ ok, id, status, summary, duplicate? }`.
  - Fase 5: la tarjeta se busca por `wallet_card_name` sin importar mayúsculas ni tildes; también coincide si Wallet agrega solo puntos o dígitos al final.
