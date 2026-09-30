import { describe, expect, it } from "vitest";
import type { Account, ApiError, Category, Rule } from "../src/shared/api";
import { api, categoryId, createAccount } from "./helpers";

describe("/api/categories", () => {
	it("lista las 22 categorías iniciales, primero los gastos", async () => {
		const { body } = await api<Category[]>("/api/categories");
		expect(body).toHaveLength(22);
		expect(body[0]).toMatchObject({ name: "Mercado", kind: "expense" });
		expect(body.at(-1)).toMatchObject({ name: "Movimiento entre mis cuentas", kind: "internal" });
	});

	it("crea, edita y borra una categoría sin uso", async () => {
		const created = await api<Category>("/api/categories", {
			method: "POST",
			body: { name: "Categoría de prueba", kind: "expense", monthly_budget: 200_000 },
		});
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ name: "Categoría de prueba", monthly_budget: 200_000, color: null });

		const path = `/api/categories/${created.body.id}`;
		const edited = await api<Category>(path, { method: "PATCH", body: { color: "#16a34a", monthly_budget: null } });
		expect(edited.body).toMatchObject({ name: "Categoría de prueba", color: "#16a34a", monthly_budget: null });

		expect((await api(path, { method: "DELETE" })).status).toBe(200);
	});

	it("no permite nombres repetidos", async () => {
		const res = await api<ApiError>("/api/categories", { method: "POST", body: { name: "Mercado", kind: "expense" } });
		expect(res.status).toBe(409);
	});

	it("rechaza colores inválidos", async () => {
		const res = await api<ApiError>("/api/categories", {
			method: "POST",
			body: { name: "Otra", kind: "expense", color: "verde" },
		});
		expect(res.status).toBe(400);
	});

	it("no borra ni cambia el tipo de una categoría que ya tiene movimientos", async () => {
		const mercado = await categoryId("Mercado");
		await api("/api/transactions", { method: "POST", body: { amount: "1000", category_id: mercado } });

		expect((await api(`/api/categories/${mercado}`, { method: "DELETE" })).status).toBe(409);
		expect((await api(`/api/categories/${mercado}`, { method: "PATCH", body: { kind: "income" } })).status).toBe(409);
		expect((await api(`/api/categories/${mercado}`, { method: "PATCH", body: { monthly_budget: 800_000 } })).status).toBe(
			200,
		);
	});
});

describe("/api/accounts", () => {
	it("crea una cuenta activa y la lista", async () => {
		const account = await createAccount("Débito de prueba");
		expect(account).toMatchObject({ name: "Débito de prueba", active: true, currency: "COP", wallet_card_name: null });

		const { body } = await api<Account[]>("/api/accounts");
		expect(body.some((a) => a.id === account.id)).toBe(true);
	});

	it("desactiva una cuenta y la deja al final de la lista", async () => {
		const inactive = await createAccount("AAA inactiva");
		await createAccount("ZZZ activa");
		const res = await api<Account>(`/api/accounts/${inactive.id}`, { method: "PATCH", body: { active: false } });
		expect(res.body.active).toBe(false);

		const { body } = await api<Account[]>("/api/accounts");
		expect(body.at(-1)?.id).toBe(inactive.id);
	});

	it("no borra una cuenta con movimientos, pero sí una sin uso", async () => {
		const used = await createAccount("Con movimientos");
		await api("/api/transactions", { method: "POST", body: { amount: "1000", account_id: used.id } });
		const res = await api<ApiError>(`/api/accounts/${used.id}`, { method: "DELETE" });
		expect(res.status).toBe(409);
		expect(res.body.message).toContain("desactívala");

		const unused = await createAccount("Sin movimientos");
		expect((await api(`/api/accounts/${unused.id}`, { method: "DELETE" })).status).toBe(200);
	});

	it("rechaza un tipo de cuenta inválido", async () => {
		const res = await api("/api/accounts", { method: "POST", body: { name: "X", type: "cripto" } });
		expect(res.status).toBe(400);
	});
});

describe("/api/rules", () => {
	it("crea reglas y las lista por prioridad", async () => {
		const restaurantes = await categoryId("Restaurantes y domicilios");
		const low = await api<Rule>("/api/rules", {
			method: "POST",
			body: { pattern: "RAPPI", merchant_name: "Rappi", category_id: restaurantes, type: "expense", priority: 50 },
		});
		expect(low.status).toBe(201);
		await api("/api/rules", { method: "POST", body: { pattern: "UBER" } });

		const { body } = await api<Rule[]>("/api/rules");
		expect(body.map((r) => r.pattern)).toEqual(["RAPPI", "UBER"]);
		expect(body[1]).toMatchObject({ priority: 100, category_id: null, type: null });
	});

	it("rechaza una categoría que no corresponde al tipo de la regla", async () => {
		const salario = await categoryId("Salario");
		const res = await api<ApiError>("/api/rules", {
			method: "POST",
			body: { pattern: "NOMINA", category_id: salario, type: "expense" },
		});
		expect(res.status).toBe(400);
	});

	it("edita y borra una regla", async () => {
		const created = await api<Rule>("/api/rules", { method: "POST", body: { pattern: "EXITO" } });
		const path = `/api/rules/${created.body.id}`;
		const edited = await api<Rule>(path, { method: "PATCH", body: { merchant_name: "Éxito", priority: 10 } });
		expect(edited.body).toMatchObject({ pattern: "EXITO", merchant_name: "Éxito", priority: 10 });
		expect((await api(path, { method: "DELETE" })).status).toBe(200);
		expect((await api(path, { method: "DELETE" })).status).toBe(404);
	});

	it("rechaza un patrón vacío", async () => {
		expect((await api("/api/rules", { method: "POST", body: { pattern: "   " } })).status).toBe(400);
	});
});
