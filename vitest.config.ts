import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			// Valores ficticios solo para tests.
			miniflare: {
				bindings: {
					DEV_BYPASS_AUTH: "true",
					ACCESS_TEAM_DOMAIN: "https://equipo-de-prueba.cloudflareaccess.com",
					ACCESS_AUD: "aud-de-prueba",
					ALLOWED_EMAILS: "yo@example.com",
					INGEST_KEY: "clave-de-prueba",
					TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
				},
			},
		})),
	],
	test: {
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
