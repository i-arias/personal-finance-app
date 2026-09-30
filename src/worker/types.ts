export type AppEnv = {
	Bindings: Env & {
		// Solo en .dev.vars: permite saltar la verificación de Access en localhost.
		DEV_BYPASS_AUTH?: string;
		// Secreto (wrangler secret put INGEST_KEY): clave extra que exige /api/ingest/*.
		INGEST_KEY?: string;
	};
	Variables: {
		/** Correo de la persona, o "Atajo del iPhone" si entró con el Service Token. */
		user: string;
	};
};
