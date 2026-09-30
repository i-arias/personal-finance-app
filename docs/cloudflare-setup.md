# Guía: Cloudflare (Worker + Access)

Esta guía explica cómo poner la app en internet y protegerla para que **solo tú** puedas entrar.

La app vive en un **Worker** de Cloudflare: un solo despliegue sirve la página (React) y la API (`/api/*`). Delante del Worker está **Cloudflare Access**, que pide login antes de dejar pasar cualquier petición. El Worker, además, revisa por su cuenta el token que le entrega Access. Así, si Access se desactivara por error, la API seguiría rechazando todo.

> Los menús de Cloudflare cambian seguido. Si un nombre no coincide exactamente, busca la opción que haga lo mismo.

---

## 1. Requisitos (Fase 0)

- Cuenta de Cloudflare, con la verificación en dos pasos activada.
- `npx wrangler login` hecho en el PC. Se comprueba con `npx wrangler whoami`.

## 2. Crear la organización Zero Trust (una sola vez)

Access es parte de "Zero Trust". Hay que crear la organización antes de poder usarlo.

1. En https://dash.cloudflare.com, entra a **Zero Trust** (menú de la izquierda).
2. **Team name**: un nombre en minúsculas, sin espacios (ej. `mis-finanzas`). Queda como `https://<team-name>.cloudflareaccess.com`.
3. **Plan**: **Free** ($0, hasta 50 usuarios).
4. **Pago**: Cloudflare exige registrar un medio de pago (tarjeta o PayPal) aunque el plan sea gratis. **Revisa que el total sea $0.** Si aparece cualquier cobro, detente.

El team name se consulta después en **Zero Trust → Settings**.

## 3. Desplegar la app

En PowerShell, dentro de la carpeta del proyecto:

```powershell
npm run deploy
```

Esto compila la app y la sube a Cloudflare.

- La primera vez, Wrangler puede preguntar si quieres registrar un subdominio `workers.dev`. Responde que sí y elige un nombre; aparecerá en la URL.
- Al final muestra la URL de la app, algo como `https://personal-finance.<tu-subdominio>.workers.dev`.

Si abres esa URL **antes** de activar Access, verás la página con "Error: unauthorized". Es lo esperado: la API rechaza todo mientras no haya login.

## 4. Activar Access en el Worker

1. En el dashboard: **Workers & Pages** → selecciona **personal-finance** → pestaña **Access**.
2. **Protect this Worker behind Access**.
3. Alcance: **All traffic** (protege la URL de `workers.dev` y cualquier otra que tenga el Worker).
4. **Authentication policy**: elige **Cloudflare account**. Así solo pueden entrar los miembros de tu cuenta de Cloudflare, es decir, tú.
   - ⚠️ **No uses "Email domain" con `gmail.com`**: dejaría entrar a cualquier persona con Gmail.
5. **Apply Access**.

Desde ese momento, abrir la app pide iniciar sesión con tu cuenta de Cloudflare.

## 5. Pasarle a la app los datos de Access

El Worker necesita dos datos para verificar el token. **No son secretos.**

| Dato | Dónde se encuentra | Ejemplo |
|---|---|---|
| Team domain | **Zero Trust → Settings** → team name | `https://mis-finanzas.cloudflareaccess.com` |
| AUD tag | **Zero Trust → Access controls → Applications** → la app del Worker → **Configure** → **Additional settings** → *Application Audience (AUD) Tag* | una cadena larga de letras y números |

Se guardan en `wrangler.jsonc`, en `vars`:

```jsonc
"vars": {
	"ACCESS_TEAM_DOMAIN": "https://mis-finanzas.cloudflareaccess.com",
	"ACCESS_AUD": "<AUD tag>",
	"ALLOWED_EMAILS": "..."
}
```

`ALLOWED_EMAILS` es la lista de correos (separados por comas) que el Worker acepta dentro del token.

Después, vuelve a desplegar con `npm run deploy`.

## 6. Probar

1. **En el iPhone, en una pestaña privada de Safari**, abre la URL de la app.
   - Debe aparecer la pantalla de login de Cloudflare Access.
   - Después de entrar, la página debe decir **"Conectada ✓"** y mostrar tu correo.
2. **Con otra cuenta** (o pidiéndole a alguien que abra la URL): no debe poder entrar.
3. En el PC, en una ventana privada, abre `https://<tu-url>/api/health` **sin iniciar sesión**: debe mandarte al login de Access, no mostrar datos.

## 7. Desarrollo local

```powershell
Copy-Item .dev.vars.example .dev.vars   # solo la primera vez
npm run dev
```

`.dev.vars` tiene `DEV_BYPASS_AUTH=true`, que permite usar la API sin Access **solo en `localhost`**. Ese archivo no se sube a git y no existe en Cloudflare.

## 8. Problemas comunes

| Síntoma | Causa probable |
|---|---|
| La página dice "Error: unauthorized" después de iniciar sesión | Faltan `ACCESS_TEAM_DOMAIN` o `ACCESS_AUD` en `wrangler.jsonc`, están mal copiados, o no se volvió a desplegar. |
| Igual "unauthorized" con los datos bien | El correo con el que entraste no está en `ALLOWED_EMAILS`. |
| No aparece la pantalla de login | Access no está activado en el Worker (paso 4), o el alcance quedó en "Previews only". |
| Tengo que iniciar sesión muy seguido | La sesión de Access dura 24 h por defecto. Se puede alargar en la configuración de la aplicación en Zero Trust. |
