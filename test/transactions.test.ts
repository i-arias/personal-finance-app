import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { Account, ApiError, Transaction, TransactionPage } from "../src/shared/api";
import { api, categoryId, createAccount } from "./helpers";

let mercado: number;
let restaurantes: number;
let salario: number;
let account: Account;

beforeAll(async () => {
	mercado = await categoryId("Mercado");
	restaurantes = await categoryId("Restaurantes y domicilios");
	salario = await categoryId("Salario");
	account = await createAccount();
});

function create(body: Record<string, unknown>) {
	return api<Transaction>("/api/transactions", { method: "POST", body });
}

describe("POST /api/transactions", () => {
	it("crea un gasto manual con el monto en texto y la fecha en hora de Bogotá", async () => {
		const res = await create({
			amount: "$25.000",
			occurred_at: "2030-01-15T21:30:00-05:00",
			merchant: "Tienda de prueba",
			category_id: mercado,
			account_id: account.id,
			note: "  ",
		});
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			amount_minor: 2_500_000,
			currency: "COP",
			type: "expense",
			occurred_at: "2030-01-15T21:30:00-05:00",
			local_date: "2030-01-15", // 9:30 p. m.: no pasa al día siguiente
			merchant: "Tienda de prueba",
			merchant_raw: "Tienda de prueba",
			category_id: mercado,
			account_id: account.id,
			source: "manual",
			status: "ok",
			note: null,
		});
	});

	it("sin categoría queda por revisar", async () => {
		const res = await create({ amount: "10000", occurred_at: "2030-01-16T10:00:00-05:00" });
		expect(res.status).toBe(201);
		expect(res.body.status).toBe("review");
	});

	it("acepta un ingreso con una categoría de ingresos", async () => {
		const res = await create({ amount: "3.000.000", type: "income", category_id: salario });
		expect(res.status).toBe(201);
		expect(res.body.type).toBe("income");
	});

	it.each([
		[{ amount: "abc" }, "Monto inválido"],
		[{ amount: "0" }, "Monto inválido"],
		[{ amount: "1000", occurred_at: "ayer" }, "Fecha inválida"],
		[{ amount: "1000", category_id: 0 }, "category_id"],
		[{ amount: "1000", account_id: 999_999 }, "La cuenta no existe"],
		[{ amount: "1000", category_id: 999_999 }, "La categoría no existe"],
		[{ amount: "1000", type: "otro" }, "type"],
		[{}, "amount"],
	])("rechaza %j", async (body, message) => {
		const res = await api<ApiError>("/api/transactions", { method: "POST", body });
		expect(res.status).toBe(400);
		expect(res.body.message).toContain(message);
	});

	it("rechaza un gasto con una categoría de ingresos", async () => {
		const res = await api<ApiError>("/api/transactions", {
			method: "POST",
			body: { amount: "1000", category_id: salario },
		});
		expect(res.status).toBe(400);
		expect(res.body.message).toBe("La categoría no corresponde al tipo de movimiento");
	});

	it("rechaza JSON mal formado", async () => {
		const res = await exports.default.fetch("http://localhost/api/transactions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{no es json",
		});
		expect(res.status).toBe(400);
	});
});

describe("GET /api/transactions", () => {
	it("filtra por rango de fechas, ordena del más reciente al más antiguo y suma los totales", async () => {
		await create({ amount: "1000", occurred_at: "2030-02-01T08:00:00-05:00", category_id: mercado });
		await create({ amount: "2000", occurred_at: "2030-02-03T08:00:00-05:00", category_id: mercado });
		await create({ amount: "4000", occurred_at: "2030-02-02T08:00:00-05:00", category_id: restaurantes });
		await create({ amount: "9000", occurred_at: "2030-03-01T08:00:00-05:00", category_id: mercado });

		const res = await api<TransactionPage>("/api/transactions?from=2030-02-01&to=2030-02-28");
		expect(res.status).toBe(200);
		expect(res.body.items.map((t) => t.local_date)).toEqual(["2030-02-03", "2030-02-02", "2030-02-01"]);
		expect(res.body.totals).toEqual([{ type: "expense", currency: "COP", amount_minor: 700_000 }]);
		expect(res.body.next_cursor).toBeNull();
	});

	it("filtra por categoría y por estado", async () => {
		await create({ amount: "1500", occurred_at: "2030-04-01T08:00:00-05:00", category_id: restaurantes });
		await create({ amount: "2500", occurred_at: "2030-04-02T08:00:00-05:00" });

		const byCategory = await api<TransactionPage>(
			`/api/transactions?from=2030-04-01&to=2030-04-30&category_id=${restaurantes}`,
		);
		expect(byCategory.body.items.map((t) => t.amount_minor)).toEqual([150_000]);

		const review = await api<TransactionPage>("/api/transactions?from=2030-04-01&to=2030-04-30&status=review");
		expect(review.body.items.map((t) => t.amount_minor)).toEqual([250_000]);
	});

	it("pagina con cursor", async () => {
		for (const day of ["01", "02", "03"]) {
			await create({ amount: "1000", occurred_at: `2030-05-${day}T08:00:00-05:00`, category_id: mercado });
		}
		const first = await api<TransactionPage>("/api/transactions?from=2030-05-01&to=2030-05-31&limit=2");
		expect(first.body.items.map((t) => t.local_date)).toEqual(["2030-05-03", "2030-05-02"]);
		expect(first.body.next_cursor).not.toBeNull();

		const second = await api<TransactionPage>(
			`/api/transactions?from=2030-05-01&to=2030-05-31&limit=2&cursor=${encodeURIComponent(first.body.next_cursor!)}`,
		);
		expect(second.body.items.map((t) => t.local_date)).toEqual(["2030-05-01"]);
		expect(second.body.next_cursor).toBeNull();
		expect(second.body.totals).toBeNull();
	});

	it("busca por texto, tratando % y _ como caracteres normales", async () => {
		await create({ amount: "1000", occurred_at: "2030-06-01T08:00:00-05:00", merchant: "Jugos 100% Naturales" });
		await create({ amount: "1000", occurred_at: "2030-06-02T08:00:00-05:00", merchant: "Tienda 1000 Naturales" });

		const res = await api<TransactionPage>(`/api/transactions?from=2030-06-01&to=2030-06-30&q=${encodeURIComponent("100%")}`);
		expect(res.body.items.map((t) => t.merchant)).toEqual(["Jugos 100% Naturales"]);
	});

	it("rechaza filtros inválidos", async () => {
		expect((await api("/api/transactions?from=2030-13-01")).status).toBe(400);
		expect((await api("/api/transactions?limit=0")).status).toBe(400);
		expect((await api("/api/transactions?cursor=basura")).status).toBe(400);
	});
});

describe("GET, PATCH y DELETE /api/transactions/:id", () => {
	it("edita el monto y la fecha, y recalcula el día local", async () => {
		const created = await create({ amount: "1000", occurred_at: "2030-07-01T08:00:00-05:00", category_id: mercado });
		const res = await api<Transaction>(`/api/transactions/${created.body.id}`, {
			method: "PATCH",
			body: { amount: "$ 12.345,67", occurred_at: "2030-07-05T23:59:00-05:00", note: "corregido" },
		});
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			amount_minor: 1_234_567,
			local_date: "2030-07-05",
			note: "corregido",
			category_id: mercado,
		});
	});

	it("al revisar un movimiento le asigna categoría y lo marca como OK", async () => {
		const created = await create({ amount: "1000" });
		const res = await api<Transaction>(`/api/transactions/${created.body.id}`, {
			method: "PATCH",
			body: { category_id: restaurantes, status: "ok" },
		});
		expect(res.body).toMatchObject({ category_id: restaurantes, status: "ok" });
	});

	it("no permite cambiar el tipo si la categoría ya no corresponde", async () => {
		const created = await create({ amount: "1000", category_id: mercado });
		const res = await api<ApiError>(`/api/transactions/${created.body.id}`, {
			method: "PATCH",
			body: { type: "income" },
		});
		expect(res.status).toBe(400);

		const ok = await api<Transaction>(`/api/transactions/${created.body.id}`, {
			method: "PATCH",
			body: { type: "income", category_id: salario },
		});
		expect(ok.body).toMatchObject({ type: "income", category_id: salario });
	});

	it("consulta y borra un movimiento", async () => {
		const created = await create({ amount: "1000" });
		const path = `/api/transactions/${created.body.id}`;
		expect((await api<Transaction>(path)).body.id).toBe(created.body.id);
		expect((await api(path, { method: "DELETE" })).status).toBe(200);
		expect((await api(path)).status).toBe(404);
		expect((await api(path, { method: "DELETE" })).status).toBe(404);
	});

	it("responde 404 con ids inexistentes o inválidos", async () => {
		expect((await api("/api/transactions/999999")).status).toBe(404);
		expect((await api("/api/transactions/abc")).status).toBe(404);
		expect((await api("/api/transactions/999999", { method: "PATCH", body: { note: "x" } })).status).toBe(404);
	});
});
