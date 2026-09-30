import { Hono } from "hono";
import { z } from "zod";
import { ACCOUNT_TYPES, CURRENCIES, type Account } from "../../shared/api";
import { conflict, idParam, jsonBody, notFound, nullableText } from "../lib/http";
import type { AppEnv } from "../types";

const COLUMNS = "id, name, institution, type, wallet_card_name, currency, active";

type AccountRow = Omit<Account, "active"> & { active: number };

const toAccount = (row: AccountRow): Account => ({ ...row, active: row.active === 1 });

const createSchema = z.object({
	name: z.string().trim().min(1).max(60),
	institution: nullableText(60).optional(),
	type: z.enum(ACCOUNT_TYPES),
	wallet_card_name: nullableText(100).optional(),
	currency: z.enum(CURRENCIES).default("COP"),
	active: z.boolean().default(true),
});

const updateSchema = z.object({
	name: z.string().trim().min(1).max(60).optional(),
	institution: nullableText(60).optional(),
	type: z.enum(ACCOUNT_TYPES).optional(),
	wallet_card_name: nullableText(100).optional(),
	currency: z.enum(CURRENCIES).optional(),
	active: z.boolean().optional(),
});

export const accounts = new Hono<AppEnv>();

accounts.get("/", async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT ${COLUMNS} FROM accounts ORDER BY active DESC, name COLLATE NOCASE`,
	).all<AccountRow>();
	return c.json(results.map(toAccount));
});

accounts.post("/", jsonBody(createSchema), async (c) => {
	const body = c.req.valid("json");
	const row = await c.env.DB.prepare(
		`INSERT INTO accounts (name, institution, type, wallet_card_name, currency, active) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
	)
		.bind(
			body.name,
			body.institution ?? null,
			body.type,
			body.wallet_card_name ?? null,
			body.currency,
			body.active ? 1 : 0,
		)
		.first<AccountRow>();
	return c.json(row && toAccount(row), 201);
});

accounts.patch("/:id", idParam, jsonBody(updateSchema), async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const current = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`).bind(id).first<AccountRow>();
	if (!current) return notFound(c, "Cuenta no encontrada");

	const next = { ...toAccount(current), ...body };
	const row = await c.env.DB.prepare(
		`UPDATE accounts SET name = ?, institution = ?, type = ?, wallet_card_name = ?, currency = ?, active = ? WHERE id = ? RETURNING ${COLUMNS}`,
	)
		.bind(next.name, next.institution, next.type, next.wallet_card_name, next.currency, next.active ? 1 : 0, id)
		.first<AccountRow>();
	return c.json(row && toAccount(row));
});

accounts.delete("/:id", idParam, async (c) => {
	const { id } = c.req.valid("param");
	const used = await c.env.DB.prepare("SELECT 1 FROM transactions WHERE account_id = ? LIMIT 1").bind(id).first();
	if (used) return conflict(c, "La cuenta tiene movimientos; desactívala en lugar de borrarla");
	const { meta } = await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
	return meta.changes ? c.json({ ok: true }) : notFound(c, "Cuenta no encontrada");
});
