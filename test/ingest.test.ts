import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { Account, Transaction, TransactionPage } from "../src/shared/api";
import { toLocalDate } from "../src/shared/dates";
import type { IngestResponse } from "../src/worker/routes/ingest";
import { api, categoryId } from "./helpers";

let visa: Account;
let restaurantes: number;

async function ingest(body: unknown, key: string | null = "clave-de-prueba") {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (key !== null) headers["X-Ingest-Key"] = key;
	const res = await exports.default.fetch("http://localhost/api/ingest/apple-pay", {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as IngestResponse };
}

async function getTransaction(id: number) {
	return (await api<Transaction & { raw_payload?: string }>(`/api/transactions/${id}`)).body;
}

/** Intl usa espacios duros; para comparar textos se normalizan. */
const plain = (text: string) => text.replace(/\s/g, " ");

beforeAll(async () => {
	restaurantes = await categoryId("Restaurantes y domicilios");
	const suscripciones = await categoryId("Suscripciones");
	const mercado = await categoryId("Mercado");
	const pagoTarjeta = await categoryId("Pago de tarjeta de crédito");

	visa = (
		await api<Account>("/api/accounts", {
			method: "POST",
			body: { name: "Visa ficticia", type: "credit_card", wallet_card_name: "Visa Ficticia" },
		})
	).body;

	const rules = [
		{ pattern: "RAPPI", merchant_name: "Rappi", category_id: restaurantes, priority: 50 },
		{ pattern: "rappi prime", merchant_name: "Rappi Prime", category_id: suscripciones, priority: 10 },
		{ pattern: "Éxito", merchant_name: "Éxito", category_id: mercado },
		{ pattern: "ABONO TARJETA", type: "internal", category_id: pagoTarjeta },
		{ pattern: "TIENDA SIN CATEGORIA", merchant_name: "Tienda" },
	];
	for (const rule of rules) await api("/api/rules", { method: "POST", body: rule });
});

describe("seguridad de /api/ingest", () => {
	it("rechaza la petición sin X-Ingest-Key", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "$1.000", card: "Visa Ficticia" }, null);
		expect(res.status).toBe(401);
		expect(res.body.ok).toBe(false);
	});

	it("rechaza una clave incorrecta y lo dice en el resumen", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "$1.000", card: "Visa Ficticia" }, "otra-clave");
		expect(res.status).toBe(401);
		expect(res.body.summary).toContain("Clave del Atajo inválida");
	});
});

describe("POST /api/ingest/apple-pay", () => {
	it("registra un pago completo, aplica la regla y responde el resumen para la notificación", async () => {
		const payload = {
			merchant: "RAPPI COLOMBIA*SAS",
			amount_text: "$25.000,00",
			card: "Visa Ficticia",
			occurred_at: "2030-10-01T21:45:00-05:00",
		};
		const res = await ingest(payload);
		expect(res.status).toBe(201);
		expect(res.body.ok).toBe(true);
		expect(res.body.status).toBe("ok");
		expect(plain(res.body.summary)).toBe("$ 25.000 · Rappi · Restaurantes y domicilios");

		const tx = await getTransaction(res.body.id!);
		expect(tx).toMatchObject({
			amount_minor: 2_500_000,
			currency: "COP",
			type: "expense",
			merchant_raw: "RAPPI COLOMBIA*SAS",
			merchant: "Rappi",
			category_id: restaurantes,
			account_id: visa.id,
			source: "apple_pay",
			status: "ok",
			local_date: "2030-10-01",
		});
	});

	it("gana la regla de menor prioridad", async () => {
		const res = await ingest({ merchant: "RAPPI PRIME", amount_text: "$10.900", card: "Visa Ficticia" });
		expect(plain(res.body.summary)).toBe("$ 10.900 · Rappi Prime · Suscripciones");
	});

	it("compara comercio y tarjeta sin importar tildes ni mayúsculas", async () => {
		const res = await ingest({ merchant: "EXITO LAURELES", amount_text: "84200", card: "VISA FICTICIA" });
		expect(res.body.status).toBe("ok");
		expect(plain(res.body.summary)).toBe("$ 84.200 · Éxito · Mercado");
	});

	it("reconoce la tarjeta aunque Wallet agregue algo al final", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "5000", card: "Visa Ficticia •••• 0000" });
		expect((await getTransaction(res.body.id!)).account_id).toBe(visa.id);
	});

	it("una regla puede marcar el movimiento como interno", async () => {
		const res = await ingest({ merchant: "ABONO TARJETA VISA", amount_text: "500.000", card: "Visa Ficticia" });
		const tx = await getTransaction(res.body.id!);
		expect(tx.type).toBe("internal");
		expect(tx.status).toBe("ok");
	});

	it("sin regla que aplique, queda en Otros y por revisar", async () => {
		const res = await ingest({ merchant: "COMERCIO DESCONOCIDO", amount_text: "$7.500", card: "Visa Ficticia" });
		expect(res.body.status).toBe("review");
		expect(plain(res.body.summary)).toBe("⚠ $ 7.500 · COMERCIO DESCONOCIDO · Por revisar");
		const tx = await getTransaction(res.body.id!);
		expect(tx.category_id).toBe(await categoryId("Otros"));
	});

	it("una regla sin categoría pone el nombre, pero deja el movimiento por revisar", async () => {
		const res = await ingest({ merchant: "TIENDA SIN CATEGORIA 123", amount_text: "3000", card: "Visa Ficticia" });
		expect(res.body.status).toBe("review");
		expect((await getTransaction(res.body.id!)).merchant).toBe("Tienda");
	});

	it("una tarjeta desconocida queda sin cuenta y por revisar", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "$6.000", card: "Mastercard Otra" });
		expect(res.body.status).toBe("review");
		expect((await getTransaction(res.body.id!)).account_id).toBeNull();
	});

	it.each([
		["monto en 0", { merchant: "RAPPI", amount_text: "0", card: "Visa Ficticia" }],
		["monto vacío", { merchant: "RAPPI", amount_text: "", card: "Visa Ficticia" }],
		["comercio vacío", { merchant: "", amount_text: "$9.000", card: "Visa Ficticia" }],
		["sin campos", {}],
	])("guarda igual un pago con %s, por revisar", async (_, payload) => {
		const res = await ingest({ ...payload, occurred_at: `2030-11-0${Math.floor(Math.random() * 9) + 1}T10:00:00-05:00` });
		expect(res.status).toBe(201);
		expect(res.body.status).toBe("review");
		expect(res.body.summary.startsWith("⚠")).toBe(true);
	});

	it("guarda aunque el cuerpo no sea JSON, con el texto original", async () => {
		const res = await ingest("esto no es json");
		expect(res.status).toBe(201);
		expect(res.body.status).toBe("review");
		expect(plain(res.body.summary)).toBe("⚠ Monto desconocido · Sin comercio · Por revisar");
		const { body } = await api<TransactionPage>("/api/transactions?status=review&q=zzz-no-existe");
		expect(body.items).toHaveLength(0); // la búsqueda no rompe con estos datos
	});

	it("acepta pagos en dólares", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "US$12.99", card: "Visa Ficticia" });
		const tx = await getTransaction(res.body.id!);
		expect(tx).toMatchObject({ amount_minor: 1_299, currency: "USD" });
	});

	it("sin fecha usa la hora actual de Bogotá", async () => {
		const res = await ingest({ merchant: "RAPPI", amount_text: "$4.321", card: "Visa Ficticia" });
		expect((await getTransaction(res.body.id!)).local_date).toBe(toLocalDate(new Date()));
	});

	it("no duplica el mismo pago enviado dos veces en el mismo minuto", async () => {
		const payload = {
			merchant: "RAPPI",
			amount_text: "$11.111",
			card: "Visa Ficticia",
			occurred_at: "2030-12-24T20:00:05-05:00",
		};
		const first = await ingest(payload);
		const second = await ingest({ ...payload, occurred_at: "2030-12-24T20:00:40-05:00" });
		expect(first.status).toBe(201);
		expect(second.status).toBe(200);
		expect(second.body).toMatchObject({ ok: true, duplicate: true, id: first.body.id });
		expect(second.body.summary.startsWith("Ya registrado")).toBe(true);

		const { body } = await api<TransactionPage>("/api/transactions?from=2030-12-24&to=2030-12-24");
		expect(body.items).toHaveLength(1);
	});

	it("sí registra el mismo monto y comercio en otro minuto", async () => {
		const payload = { merchant: "RAPPI", amount_text: "$22.222", card: "Visa Ficticia" };
		const first = await ingest({ ...payload, occurred_at: "2030-12-25T09:00:00-05:00" });
		const second = await ingest({ ...payload, occurred_at: "2030-12-25T09:05:00-05:00" });
		expect(second.body.id).not.toBe(first.body.id);
		expect(second.body.duplicate).toBeUndefined();
	});
});
