import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Crea las tablas y carga las categorías en la base de datos local de los tests.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
