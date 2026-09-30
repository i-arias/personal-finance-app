import { exports } from "cloudflare:workers";
import type { Account, Category } from "../src/shared/api";

/** Llama a la API como si fuera localhost (DEV_BYPASS_AUTH está activo en los tests). */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}) {
	const res = await exports.default.fetch(`http://localhost${path}`, {
		method: init.method ?? "GET",
		headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const isJson = res.headers.get("Content-Type")?.includes("application/json");
	const body = (isJson ? await res.json() : null) as T;
	return { status: res.status, headers: res.headers, body };
}

export async function categoryId(name: string): Promise<number> {
	const { body } = await api<Category[]>("/api/categories");
	const category = body.find((c) => c.name === name);
	if (!category) throw new Error(`No existe la categoría ${name}`);
	return category.id;
}

export async function createAccount(name = "Tarjeta de prueba"): Promise<Account> {
	const { body } = await api<Account>("/api/accounts", {
		method: "POST",
		body: { name, institution: "Banco Ficticio", type: "credit_card" },
	});
	return body;
}
