# Guía: base de datos (D1)

La app guarda todo en **Cloudflare D1**, una base de datos SQLite en la nube. Se llama `personal-finance-db` y el Worker la usa con el nombre `DB`.

Hay dos copias:
- **Remota** (`--remote`): la de verdad, en Cloudflare. Es la que usa la app publicada.
- **Local** (`--local`): una copia de prueba en tu PC, en `.wrangler/`. La usa `npm run dev`. No se sube a git.

---

## Crear o actualizar las tablas (migraciones)

Las tablas se definen en archivos SQL numerados en `migrations/`. Cada archivo se aplica una sola vez; D1 recuerda cuáles ya aplicó.

```powershell
npm run db:migrate:local    # copia local
npm run db:migrate:remote   # base de verdad en Cloudflare
```

`db:migrate:remote` pide confirmación: responde `y`.

Si aparece una migración nueva (por ejemplo, cuando Claude agrega una tabla), hay que correr **los dos** comandos y luego `npm run deploy`.

## Mis cuentas y tarjetas

Las cuentas reales están en `scripts/accounts.local.sql`, que **no se sube a git**. El formato está en `scripts/accounts.example.sql`, con datos ficticios.

```powershell
npm run db:accounts:local    # copia local
npm run db:accounts:remote   # base de verdad en Cloudflare
```

Se puede ejecutar varias veces: si una cuenta ya existe (mismo nombre), no la duplica.

Para **agregar** una cuenta, añade otro bloque `INSERT` al archivo y vuelve a ejecutar el comando. Para **editar o desactivar** una existente, espera a la Fase 3: se hará desde la app.

## Consultar la base de datos a mano

```powershell
npx wrangler d1 execute DB --remote --command "SELECT name, type FROM accounts"
```

Cambia `--remote` por `--local` para consultar la copia local.

## Comprobar que todo está bien

Abre la app: debajo de "Conectada ✓" debe decir **"Base de datos ✓"** con el número de categorías y de cuentas.

Si dice "Error: internal_error", lo más probable es que falte aplicar las migraciones en la base remota (`npm run db:migrate:remote`).
