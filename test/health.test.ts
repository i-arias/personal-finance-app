import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
	it("rechaza la petición sin token de Access", async () => {
		const res = await exports.default.fetch("https://personal-finance.example.workers.dev/api/health");
		expect(res.status).toBe(401);
	});

	it("rechaza un token que no es un JWT válido", async () => {
		const res = await exports.default.fetch("https://personal-finance.example.workers.dev/api/health", {
			headers: { "Cf-Access-Jwt-Assertion": "no-es-un-jwt" },
		});
		expect(res.status).toBe(401);
	});

	it("con DEV_BYPASS_AUTH responde en localhost, con el estado de la base de datos", async () => {
		const res = await exports.default.fetch("http://localhost/api/health");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ok: true,
			user: "dev@localhost",
			db: { categories: 22, accounts: 0 },
		});
	});
});

describe("rutas desconocidas de la API", () => {
	it("responden 404 en JSON", async () => {
		const res = await exports.default.fetch("http://localhost/api/no-existe");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ ok: false, error: "not_found" });
	});
});
