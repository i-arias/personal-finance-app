import { Hono } from "hono";
import { z } from "zod";
import { TRANSACTION_TYPES, type Rule, type TransactionType } from "../../shared/api";
import { badRequest, idOrNull, idParam, jsonBody, notFound, nullableText } from "../lib/http";
import type { AppEnv } from "../types";

const COLUMNS = "id, pattern, merchant_name, category_id, type, priority";

const createSchema = z.object({
	pattern: z.string().trim().min(1).max(100),
	merchant_name: nullableText(200).optional(),
	category_id: idOrNull.optional(),
	type: z.enum(TRANSACTION_TYPES).nullable().optional(),
	priority: z.number().int().min(0).max(10_000).default(100),
});

const updateSchema = z.object({
	pattern: z.string().trim().min(1).max(100).optional(),
	merchant_name: nullableText(200).optional(),
	category_id: idOrNull.optional(),
	type: z.enum(TRANSACTION_TYPES).nullable().optional(),
	priority: z.number().int().min(0).max(10_000).optional(),
});

/** La categoría debe existir y, si la regla fija un tipo, coincidir con él. */
async function checkCategory(
	db: D1Database,
	categoryId: number | null,
	type: TransactionType | null,
): Promise<string | null> {
	if (categoryId === null) return null;
	const category = await db
		.prepare("SELECT kind FROM categories WHERE id = ?")
		.bind(categoryId)
		.first<{ kind: TransactionType }>();
	if (!category) return "La categoría no existe";
	if (type !== null && category.kind !== type) return "La categoría no corresponde al tipo de la regla";
	return null;
}

export const rules = new Hono<AppEnv>();

rules.get("/", async (c) => {
	const { results } = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM rules ORDER BY priority, id`).all<Rule>();
	return c.json(results);
});

rules.post("/", jsonBody(createSchema), async (c) => {
	const body = c.req.valid("json");
	const categoryId = body.category_id ?? null;
	const type = body.type ?? null;
	const problem = await checkCategory(c.env.DB, categoryId, type);
	if (problem) return badRequest(c, problem);

	const row = await c.env.DB.prepare(
		`INSERT INTO rules (pattern, merchant_name, category_id, type, priority) VALUES (?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
	)
		.bind(body.pattern, body.merchant_name ?? null, categoryId, type, body.priority)
		.first<Rule>();
	return c.json(row, 201);
});

rules.patch("/:id", idParam, jsonBody(updateSchema), async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const current = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM rules WHERE id = ?`).bind(id).first<Rule>();
	if (!current) return notFound(c, "Regla no encontrada");

	const next = { ...current, ...body };
	const problem = await checkCategory(c.env.DB, next.category_id, next.type);
	if (problem) return badRequest(c, problem);

	const row = await c.env.DB.prepare(
		`UPDATE rules SET pattern = ?, merchant_name = ?, category_id = ?, type = ?, priority = ? WHERE id = ? RETURNING ${COLUMNS}`,
	)
		.bind(next.pattern, next.merchant_name, next.category_id, next.type, next.priority, id)
		.first<Rule>();
	return c.json(row);
});

rules.delete("/:id", idParam, async (c) => {
	const { id } = c.req.valid("param");
	const { meta } = await c.env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
	return meta.changes ? c.json({ ok: true }) : notFound(c, "Regla no encontrada");
});
