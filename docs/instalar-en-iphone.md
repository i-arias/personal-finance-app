# Guía: instalar la app en el iPhone

La app se puede "instalar" como si fuera de la App Store: queda con su ícono en la pantalla de inicio y se abre a pantalla completa, sin la barra de Safari. Técnicamente es una **PWA** (aplicación web instalable).

---

## 1. Alargar la sesión de Access (una sola vez)

Por defecto, Cloudflare Access pide iniciar sesión cada **24 horas**. Para una app que usas a diario, conviene alargarlo.

1. En https://dash.cloudflare.com entra a **Zero Trust**.
2. **Access controls → Applications** → la aplicación del Worker (`personal-finance`) → **Configure**.
3. En **Session Duration** elige el valor más largo que ofrezca (hasta **1 month**).
4. Guarda.

Si aun así te pide iniciar sesión muy seguido, revisa también el **Global session timeout** en **Zero Trust → Settings → Authentication** y súbelo al mismo valor.

> Seguridad: una sesión larga es razonable porque el iPhone ya está protegido con Face ID o código. Si pierdes el teléfono, en Zero Trust puedes revocar las sesiones activas.

## 2. Instalar la app

Tiene que ser con **Safari**; otros navegadores del iPhone no siempre ofrecen esta opción.

1. Abre Safari y entra a `https://personal-finance.<tu-subdominio>.workers.dev`.
2. Inicia sesión si te lo pide y espera a que cargue la app.
3. Toca el botón **Compartir** (el cuadrado con la flecha hacia arriba).
4. Baja y toca **Agregar a pantalla de inicio**.
5. El nombre debe decir **Finanzas**. Toca **Agregar**.

## 3. Primer uso

1. Abre la app desde el ícono verde con el "$".
2. La app instalada tiene **su propia sesión**, separada de la de Safari: la primera vez te pedirá iniciar sesión otra vez. Es normal.
3. Después de iniciar sesión deberías ver la lista de **Movimientos**.

## 4. Si aparece "Tu sesión expiró"

Toca **Volver a iniciar sesión**: la app recarga y te lleva al login de Cloudflare Access. Tus datos no se pierden; solo venció el permiso de entrada.

## 5. Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| No aparece "Agregar a pantalla de inicio" | Asegúrate de estar en Safari (no en Chrome ni en una app que abrió el enlace). |
| El ícono quedó en blanco o con una letra | Borra el ícono, abre la app en Safari, inicia sesión y vuelve a agregarla. El ícono solo se puede descargar con la sesión iniciada. |
| La app se abre con la barra de Safari | Borra el ícono y agrégalo de nuevo desde Safari después de un deploy reciente. |
| Pide iniciar sesión todos los días | Revisa el paso 1. |
