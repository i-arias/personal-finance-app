# Guía: Atajo de Apple Pay

Con esta automatización, **cada pago con Apple Pay se registra solo** en la app. En segundos llega una notificación como `$ 25.000 · Rappi · Restaurantes y domicilios`.

Cómo funciona: la app **Atajos** del iPhone detecta el pago, toma el comercio, el monto y la tarjeta, y los envía a la API (`/api/ingest/apple-pay`). La API aplica tus reglas, evita duplicados y guarda el movimiento. Lo que llega incompleto queda en **Por revisar**.

> Los nombres de los menús de Atajos cambian entre versiones de iOS. En **iOS 26** la automatización se llama **Wallet**; en iOS 17 y 18 se llamaba **Transacción**. Si algo no coincide, busca la opción que haga lo mismo.
>
> ⚠️ La automatización se crea en la pestaña **Automatización**, no en **Atajos**: en el buscador de *acciones*, "Wallet" solo muestra acciones como "Open Card", que no sirven para esto.

### Nombres en inglés (iPhone en inglés)

| En esta guía | En inglés |
|---|---|
| Atajos → Automatización → + | Shortcuts → **Automation** → **+** / **New Automation** |
| Wallet / Transacción | **Wallet** / **Transaction** |
| Ejecutar inmediatamente · Notificar al ejecutarse | **Run Immediately** · **Notify When Run** |
| Nuevo atajo en blanco | **New Blank Automation** / **Create New Shortcut** |
| Fecha actual · Formatear fecha (ISO 8601, incluir hora) | **Current Date** · **Format Date** (**ISO 8601**, **Include ISO 8601 Time**) |
| Obtener contenido de URL · Método · Encabezados · Cuerpo de la solicitud | **Get Contents of URL** · **Method** · **Headers** · **Request Body** |
| Entrada del atajo → Comercio / Importe / Tarjeta | **Shortcut Input** → **Merchant** / **Amount** / **Card** |
| Fecha formateada | **Formatted Date** |
| Obtener valor del diccionario · Contenido de la URL | **Get Dictionary Value** · **Contents of URL** |
| Mostrar notificación · Valor del diccionario | **Show Notification** · **Dictionary Value** |
| Permitir siempre | **Always Allow** |

---

## 1. Llave de Access (Service Token): una sola vez

El Atajo no puede iniciar sesión como tú, así que usa una "llave" propia.

1. En Safari del iPhone: https://dash.cloudflare.com → **Zero Trust** → **Controles de Access** → **Credenciales de servicio** → **Service Tokens** → **Crear**.
   - Nombre: `atajo-apple-pay`.
   - Duración: **1 año** (anota en tu calendario renovarla antes de que venza).
2. Cloudflare muestra el **Client ID** y el **Client Secret**. El secret **solo se muestra una vez**: guarda ambos en la app **Contraseñas** (toca **+**, nombre `Finanzas - Atajo`, usuario = Client ID, contraseña = Client Secret).
3. Autoriza la llave en la aplicación: **Controles de Access → Aplicaciones → personal-finance → Políticas → Agregar política**.
   - **Acción: Service Auth** (si queda en "Allow", Access le pediría login al Atajo).
   - **Incluir: Service Token → `atajo-apple-pay`**.
   - ⚠️ Si la política se crea desde **Access controls → Policies** (políticas reutilizables), **no queda conectada a la app**: hay que ir a **Applications → personal-finance → Policies → Select existing policies**, marcarla y guardar. Comprobación: en **Policies**, la columna **Used by applications** debe decir **1**. Si dice 0, el Atajo recibe la página de login y falla con *"couldn't convert from Rich Text to Dictionary"*.
4. Pásale el **Client ID** a Claude para agregarlo a `ACCESS_SERVICE_TOKENS` en `wrangler.jsonc`. El Client Secret no se comparte con nadie.

## 2. Clave extra (INGEST_KEY): una sola vez

Además de la llave de Access, la ruta de pagos exige una clave propia en el header `X-Ingest-Key`.

En PowerShell (VS Code → Terminal), dentro de la carpeta del proyecto:

```powershell
$b = [byte[]]::new(24); [Security.Cryptography.RandomNumberGenerator]::Fill($b); $k = [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('='); Set-Clipboard $k; "Clave generada y copiada"
npx wrangler secret put INGEST_KEY
```

- El primer comando genera una clave aleatoria y la **copia al portapapeles**.
- El segundo pide el valor: **pega** (clic derecho o Ctrl+V) y presiona Enter. Wrangler la guarda cifrada en Cloudflare.

Para llevarla al iPhone sin escribirla a mano: pégala en **WhatsApp → chat contigo mismo**, cópiala desde el iPhone y luego **borra el mensaje** ("Eliminar para todos"). Guárdala también en la app **Contraseñas** (en la misma entrada `Finanzas - Atajo`, en Notas).

## 3. Crear la automatización

1. Abre **Atajos** → pestaña **Automatización** → **+** (Nueva automatización).
2. Elige **Wallet** (o **Transacción**).
3. Configura:
   - **Tarjetas**: selecciona todas.
   - **Categorías** y **comercios**: todos (no filtres).
   - **Ejecutar inmediatamente** (no "después de confirmar").
   - Desactiva **Notificar al ejecutarse**.
4. Toca **Siguiente** → **Nuevo atajo en blanco**.

**En la versión nueva de Atajos** (por ejemplo, con el iPhone en inglés), la automatización se arma en el mismo editor:
- Arriba queda el bloque **When Any Card is tapped**, con **Categories: Any Category**, **Merchants: Any Merchant**, **Automation** activado (se ejecuta sin preguntar) y **Notify** apagado.
- Las acciones se agregan debajo, con la barra **Search** de abajo.
- El nombre se cambia en **New Shortcut ⌄** → **Rename**.
- Se guarda al salir con **<**. Si se sale sin acciones, la automatización no se guarda.

## 4. Acciones del atajo

Agrega estas acciones en orden (usa el buscador de acciones de abajo).

**a) Fecha del pago**
1. **Fecha actual**.
2. **Formatear fecha** → Formato: **ISO 8601**, con **Incluir hora** activado. Resultado de ejemplo: `2026-10-01T13:45:00-05:00`.

**b) Enviar el pago** — acción **Obtener contenido de URL**:
- **URL**: `https://personal-finance.<tu-subdominio>.workers.dev/api/ingest/apple-pay`
- Toca la flecha para ver más opciones:
  - **Método**: `POST`
  - **Encabezados** (agrega 3):
    | Clave | Texto |
    |---|---|
    | `CF-Access-Client-Id` | tu Client ID |
    | `CF-Access-Client-Secret` | tu Client Secret |
    | `X-Ingest-Key` | la clave del paso 2 |
  - **Cuerpo de la solicitud**: **JSON**, con 4 campos de tipo **Texto**:
    | Clave | Valor (toca el campo y elige la variable) |
    |---|---|
    | `merchant` | **Entrada del atajo** → **Comercio** |
    | `amount_text` | **Entrada del atajo** → **Importe** (o Monto) |
    | `card` | **Entrada del atajo** → **Tarjeta** (o Tarjeta o pase) |
    | `occurred_at` | **Fecha formateada** (del paso a) |

  Para elegir la propiedad: toca la variable **Entrada del atajo** que insertaste y cambia "Transacción" por la propiedad que necesitas.

**c) Mostrar el resultado**
1. **Obtener valor del diccionario** → Obtener **Valor** de la clave `summary` en **Contenido de la URL**.
2. **Mostrar notificación** → con el **Valor del diccionario**.

Toca **Listo**.

## 5. Probar

**Prueba de conexión (sin comprar):** abre la automatización y toca **▶︎** (Reproducir). Como no hay un pago real, llega vacía:
- ✅ Si la notificación dice `⚠ Monto desconocido · Sin comercio · Por revisar`, la conexión y las claves funcionan. Borra ese movimiento desde **Movimientos → Por revisar**.
- ❌ `Clave del Atajo inválida` → revisa el encabezado `X-Ingest-Key`.
- ❌ Un error de Atajos o un texto HTML → revisa el Client ID/Secret y la política **Service Auth** (paso 1.3).
- La primera vez iOS puede preguntar si el atajo puede conectarse a `workers.dev`: elige **Permitir siempre**.

**Prueba real:** paga algo pequeño con Apple Pay. En unos segundos debe llegar la notificación y el movimiento aparece en la app. Si quedó **Por revisar**, ábrelo y mira **Datos originales** al final: ahí está exactamente lo que mandó Wallet.

## 6. Limitaciones conocidas

- Solo se dispara con pagos de **Apple Pay** (no con la tarjeta física).
- Wallet a veces avisa **pagos rechazados** o se demora: si llega uno que no fue, bórralo.
- Si el iPhone está **sin internet**, el atajo falla y el pago no se guarda: regístralo a mano. (Mejora futura: guardarlo y reenviarlo después.)
- La app **Wallet** necesita **datos móviles** activados (Ajustes → Datos móviles → Wallet).
- Si la automatización deja de dispararse, reinicia el iPhone; es un error conocido de iOS con algunas tarjetas.

## 7. Renovar la llave (cada año)

Antes de que venza el Service Token: **Zero Trust → Credenciales de servicio → Service Tokens → `atajo-apple-pay` → Refresh**. El Client ID y el Secret no cambian al renovar.
