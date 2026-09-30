import { Hono } from "hono";
import { z } from "zod";
import {
	CURRENCIES,
	TRANSACTION_STATUSES,
	TRANSACTION_TYPES,
	type Transaction,
	type TransactionDetail,
	type TransactionPage,
	type TransactionTotal,
	type TransactionType,
} from "../../shared/api";
import { parseOccurredAt, toBogotaIso, toLocalDate } from "../../shared/dates";
import { parseAmount } from "../../shared/money";
import { badRequest, idOrNull, idParam, jsonBody, notFound, nullableText, queryParams } from "../lib/http";
import type { AppEnv } from "../types";

export const TRANSACTION_COLUMNS =
	"id, occurred_at, local_date, amount_minor, currency, type, merchant_raw, merchant, category_id, account_id, source, status, note, created_at";

const createSchema = z.object({
	amount: z.string().max(40),
	currency: z.enum(CURRENCIES).default("COP"),
	type: z.enum(TRANSACTION_TYPES).default("expense"),
	occurred_at: z.string().max(40).optional(),
	merchant: nullableText(200).optional(),
	category_id: idOrNull.optional(),
	account_id: idOrNull.optional(),
	note: nullableText(1000).optional(),
});

const updateSchema = z.object({
	amount: z.string().max(40).optional(),
	currency: z.enum(CURRENCIES).optional(),
	type: z.enum(TRANSACTION_TYPES).optional(),
	occurred_at: z.string().max(40).optional(),
	merchant: nullableText(200).optional(),
	category_id: idOrNull.optional(),
	account_id: idOrNull.optional(),
	note: nullableText(1000).optional(),
	status: z.enum(TRANSACTION_STATUSES).optional(),
});

export const filtersSchema = z.object({
	from: z.iso.date().optional(),
	to: z.iso.date().optional(),
	account_id: z.coerce.number().int().positive().optional(),
	category_id: z.coerce.number().int().positive().optional(),
	type: z.enum(TRANSACTION_TYPES).optional(),
	status: z.enum(TRANSACTION_STATUSES).optional(),
	q: z.string().trim().max(100).optional(),
});

const listSchema = filtersSchema.extend({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	cursor: z.string().max(100).optional(),
});

/**
 * Arma el WHERE con fragmentos fijos; los valores siempre van como parámetros.
 * `table` es el alias de transactions cuando la consulta tiene JOIN (ej. "t.").
 */
export function buildFilters(filters: z.output<typeof filtersSchema>, table = "") {
	const conditions: string[] = [];
	const params: (string | number)[] = [];
	if (filters.from) {
		conditions.push(`${table}local_date >= ?`);
		params.push(filters.from);
	}
	if (filters.to) {
		conditions.push(`${table}local_date <= ?`);
		params.push(filters.to);
	}
	if (filters.account_id) {
		conditions.push(`${table}account_id = ?`);
		params.push(filters.account_id);
	}
	if (filters.category_id) {
		conditions.push(`${table}category_id = ?`);
		params.push(filters.category_id);
	}
	if (filters.type) {
		conditions.push(`${table}type = ?`);
		params.push(filters.type);
	}
	if (filters.status) {
		conditions.push(`${table}status = ?`);
		params.push(filters.status);
	}
	if (filters.q) {
		const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
		conditions.push(
			`(${table}merchant LIKE ? ESCAPE '\\' OR ${table}merchant_raw LIKE ? ESCAPE '\\' OR ${table}note LIKE ? ESCAPE '\\')`,
		);
		params.push(pattern, pattern, pattern);
	}
	return { conditions, params };
}

export function whereClause(conditions: string[]) {
	return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

/** El cursor es "occurred_at|id" del último movimiento de la página anterior. */
function parseCursor(cursor: string): { occurredAt: string; id: number } | null {
	const separator = cursor.lastIndexOf("|");
	const id = Number(cursor.slice(separator + 1));
	if (separator <= 0 || !Number.isSafeInteger(id) || id <= 0) return null;
	return { occurredAt: cursor.slice(0, separator), id };
}

/** Revisa que la categoría y la cuenta existan, y que la categoría sea del mismo tipo que el movimiento. */
async function checkReferences(
	db: D1Database,
	ref: { type: TransactionType; category_id: number | null; account_id: number | null },
): Promise<string | null> {
	if (ref.category_id !== null) {
		const category = await db
			.prepare("SELECT kind FROM categories WHERE id = ?")
			.bind(ref.category_id)
			.first<{ kind: TransactionType }>();
		if (!category) return "La categoría no existe";
		if (category.kind !== ref.type) return "La categoría no corresponde al tipo de movimiento";
	}
	if (ref.account_id !== null) {
		const account = await db.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(ref.account_id).first();
		if (!account) return "La cuenta no existe";
	}
	return null;
}

export const transactions = new Hono<AppEnv>();

transactions.get("/", queryParams(listSchema), async (c) => {
	const { limit, cursor, ...filters } = c.req.valid("query");
	const { conditions, params } = buildFilters(filters);

	let totals: TransactionTotal[] | null = null;
	if (!cursor) {
		const { results } = await c.env.DB.prepare(
			`SELECT type, currency, SUM(amount_minor) AS amount_minor FROM transactions ${whereClause(conditions)} GROUP BY type, currency`,
		)
			.bind(...params)
			.all<TransactionTotal>();
		totals = results;
	}

	const pageConditions = [...conditions];
	const pageParams = [...params];
	if (cursor) {
		const position = parseCursor(cursor);
		if (!position) return badRequest(c, "Cursor inválido");
		pageConditions.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))");
		pageParams.push(position.occurredAt, position.occurredAt, position.id);
	}

	const { results } = await c.env.DB.prepare(
		`SELECT ${TRANSACTION_COLUMNS} FROM transactions ${whereClause(pageConditions)} ORDER BY occurred_at DESC, id DESC LIMIT ?`,
	)
		.bind(...pageParams, limit + 1)
		.all<Transaction>();

	const items = results.slice(0, limit);
	const last = items.at(-1);
	const page: TransactionPage = {
		items,
		next_cursor: results.length > limit && last ? `${last.occurred_at}|${last.id}` : null,
		totals,
	};
	return c.json(page);
});

transactions.get("/:id", idParam, async (c) => {
	const { id } = c.req.valid("param");
	// El detalle incluye el texto original (raw_payload) para revisar lo que mandó el Atajo.
	const row = await c.env.DB.prepare(`SELECT ${TRANSACTION_COLUMNS}, raw_payload FROM transactions WHERE id = ?`)
		.bind(id)
		.first<TransactionDetail>();
	return row ? c.json(row) : notFound(c, "Movimiento no encontrado");
});

transactions.post("/", jsonBody(createSchema), async (c) => {
	const body = c.req.valid("json");
	const money = parseAmount(body.amount, body.currency);
	if (!money) return badRequest(c, "Monto inválido");
	const instant = body.occurred_at ? parseOccurredAt(body.occurred_at) : new Date();
	if (!instant) return badRequest(c, "Fecha inválida");

	const categoryId = body.category_id ?? null;
	const accountId = body.account_id ?? null;
	const problem = await checkReferences(c.env.DB, { type: body.type, category_id: categoryId, account_id: accountId });
	if (problem) return badRequest(c, problem);

	const merchant = body.merchant ?? null;
	const row = await c.env.DB.prepare(
		`INSERT INTO transactions (occurred_at, local_date, amount_minor, currency, type, merchant_raw, merchant, category_id, account_id, source, status, note)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
		 RETURNING ${TRANSACTION_COLUMNS}`,
	)
		.bind(
			toBogotaIso(instant),
			toLocalDate(instant),
			money.amountMinor,
			money.currency,
			body.type,
			merchant,
			merchant,
			categoryId,
			accountId,
			categoryId === null ? "review" : "ok",
			body.note ?? null,
		)
		.first<Transaction>();
	return c.json(row, 201);
});

transactions.patch("/:id", idParam, jsonBody(updateSchema), async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const current = await c.env.DB.prepare(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ?`)
		.bind(id)
		.first<Transaction>();
	if (!current) return notFound(c, "Movimiento no encontrado");

	const changes: Record<string, string | number | null> = {};

	if (body.amount !== undefined) {
		const money = parseAmount(body.amount, body.currency ?? current.currency);
		if (!money) return badRequest(c, "Monto inválido");
		changes.amount_minor = money.amountMinor;
		changes.currency = money.currency;
	} else if (body.currency !== undefined) {
		changes.currency = body.currency;
	}

	if (body.occurred_at !== undefined) {
		const instant = parseOccurredAt(body.occurred_at);
		if (!instant) return badRequest(c, "Fecha inválida");
		changes.occurred_at = toBogotaIso(instant);
		changes.local_date = toLocalDate(instant);
	}

	if (body.type !== undefined) changes.type = body.type;
	if (body.merchant !== undefined) changes.merchant = body.merchant;
	if (body.category_id !== undefined) changes.category_id = body.category_id;
	if (body.account_id !== undefined) changes.account_id = body.account_id;
	if (body.note !== undefined) changes.note = body.note;
	if (body.status !== undefined) changes.status = body.status;

	const problem = await checkReferences(c.env.DB, {
		type: body.type ?? current.type,
		category_id: body.category_id !== undefined ? body.category_id : current.category_id,
		account_id: body.account_id !== undefined ? body.account_id : current.account_id,
	});
	if (problem) return badRequest(c, problem);

	const columns = Object.keys(changes);
	if (columns.length === 0) return c.json(current);

	// Los nombres de columna vienen de la lista fija de arriba, nunca del usuario.
	const row = await c.env.DB.prepare(
		`UPDATE transactions SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ? RETURNING ${TRANSACTION_COLUMNS}`,
	)
		.bind(...Object.values(changes), id)
		.first<Transaction>();
	return c.json(row);
});

transactions.delete("/:id", idParam, async (c) => {
	const { id } = c.req.valid("param");
	const { meta } = await c.env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
	return meta.changes ? c.json({ ok: true }) : notFound(c, "Movimiento no encontrado");
});
