import { Hono } from "hono";
import { z } from "zod";
import { TRANSACTION_TYPES, type Category } from "../../shared/api";
import { conflict, idParam, isUniqueViolation, jsonBody, notFound } from "../lib/http";
import type { AppEnv } from "../types";

const COLUMNS = "id, name, kind, color, monthly_budget";

const colorSchema = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Debe ser un color como #16a34a")
	.nullable();

const createSchema = z.object({
	name: z.string().trim().min(1).max(60),
	kind: z.enum(TRANSACTION_TYPES),
	color: colorSchema.optional(),
	monthly_budget: z.number().int().min(0).nullable().optional(),
});

const updateSchema = createSchema.partial();

async function isInUse(db: D1Database, id: number): Promise<boolean> {
	const row = await db
		.prepare(
			"SELECT EXISTS (SELECT 1 FROM transactions WHERE category_id = ?1) OR EXISTS (SELECT 1 FROM rules WHERE category_id = ?1) AS used",
		)
		.bind(id)
		.first<{ used: number }>();
	return row?.used === 1;
}

export const categories = new Hono<AppEnv>();

categories.get("/", async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT ${COLUMNS} FROM categories ORDER BY CASE kind WHEN 'expense' THEN 0 WHEN 'income' THEN 1 ELSE 2 END, id`,
	).all<Category>();
	return c.json(results);
});

categories.post("/", jsonBody(createSchema), async (c) => {
	const body = c.req.valid("json");
	try {
		const row = await c.env.DB.prepare(
			`INSERT INTO categories (name, kind, color, monthly_budget) VALUES (?, ?, ?, ?) RETURNING ${COLUMNS}`,
		)
			.bind(body.name, body.kind, body.color ?? null, body.monthly_budget ?? null)
			.first<Category>();
		return c.json(row, 201);
	} catch (error) {
		if (isUniqueViolation(error)) return conflict(c, "Ya existe una categoría con ese nombre");
		throw error;
	}
});

categories.patch("/:id", idParam, jsonBody(updateSchema), async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const current = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM categories WHERE id = ?`).bind(id).first<Category>();
	if (!current) return notFound(c, "Categoría no encontrada");
	if (body.kind !== undefined && body.kind !== current.kind && (await isInUse(c.env.DB, id))) {
		return conflict(c, "No se puede cambiar el tipo de una categoría que ya tiene movimientos o reglas");
	}

	const next = { ...current, ...body };
	try {
		const row = await c.env.DB.prepare(
			`UPDATE categories SET name = ?, kind = ?, color = ?, monthly_budget = ? WHERE id = ? RETURNING ${COLUMNS}`,
		)
			.bind(next.name, next.kind, next.color ?? null, next.monthly_budget ?? null, id)
			.first<Category>();
		return c.json(row);
	} catch (error) {
		if (isUniqueViolation(error)) return conflict(c, "Ya existe una categoría con ese nombre");
		throw error;
	}
});

categories.delete("/:id", idParam, async (c) => {
	const { id } = c.req.valid("param");
	if (await isInUse(c.env.DB, id)) {
		return conflict(c, "La categoría tiene movimientos o reglas; cámbialos de categoría antes de borrarla");
	}
	const { meta } = await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
	return meta.changes ? c.json({ ok: true }) : notFound(c, "Categoría no encontrada");
});
