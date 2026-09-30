import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { csvField, formatCsvAmount } from "../src/worker/routes/export";
import { api, categoryId, createAccount } from "./helpers";

describe("formatCsvAmount", () => {
	it.each([
		[2_500_000, "COP", "25000"],
		[1_250, "COP", "12,50"],
		[1_299, "USD", "12,99"],
		[100, "USD", "1,00"],
	] as const)("%i %s → %s", (amountMinor, currency, expected) => {
		expect(formatCsvAmount(amountMinor, currency)).toBe(expected);
	});
});

describe("csvField", () => {
	it.each([
		[null, ""],
		["Rappi", "Rappi"],
		["Pan; leche", '"Pan; leche"'],
		['Dijo "hola"', '"Dijo ""hola"""'],
		["=HYPERLINK(1)", "'=HYPERLINK(1)"],
		["-5", "'-5"],
	])("%j → %j", (value, expected) => {
		expect(csvField(value)).toBe(expected);
	});
});

describe("GET /api/export.csv", () => {
	it("exporta los movimientos del rango, listos para Excel en español", async () => {
		const mercado = await categoryId("Mercado");
		const account = await createAccount("Visa de prueba");
		await api("/api/transactions", {
			method: "POST",
			body: {
				amount: "$25.000",
				occurred_at: "2030-08-10T19:05:00-05:00",
				merchant: "Pan; leche",
				category_id: mercado,
				account_id: account.id,
			},
		});
		await api("/api/transactions", {
			method: "POST",
			body: { amount: "12.99", currency: "USD", occurred_at: "2030-08-11T09:00:00-05:00" },
		});
		await api("/api/transactions", { method: "POST", body: { amount: "1000", occurred_at: "2030-09-01T09:00:00-05:00" } });

		const res = await exports.default.fetch("http://localhost/api/export.csv?from=2030-08-01&to=2030-08-31");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
		expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="movimientos_2030-08-01_2030-08-31.csv"');

		const bytes = new Uint8Array(await res.arrayBuffer());
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM de UTF-8, para Excel

		const lines = new TextDecoder().decode(bytes).trimEnd().split("\r\n");
		expect(lines).toEqual([
			"Fecha;Hora;Tipo;Monto;Moneda;Comercio;Categoría;Cuenta;Estado;Origen;Nota",
			'2030-08-10;19:05;Gasto;25000;COP;"Pan; leche";Mercado;Visa de prueba;OK;Manual;',
			"2030-08-11;09:00;Gasto;12,99;USD;;;;Por revisar;Manual;",
		]);
	});
});
