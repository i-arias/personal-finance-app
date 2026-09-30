import { Hono } from "hono";
import type { TransactionStatus, TransactionType } from "../../shared/api";
import { parseOccurredAt, toBogotaIso, toLocalDate } from "../../shared/dates";
import { formatMoney, parseAmount, type Money } from "../../shared/money";
import { findRule, loadRules } from "../lib/categorize";
import { dedupeKey } from "../lib/dedupe";
import { normalizeText } from "../lib/text";
import type { AppEnv } from "../types";

const MAX_RAW_PAYLOAD = 10_000;

export interface IngestResponse {
	ok: boolean;
	id?: number;
	status?: TransactionStatus;
	/** Texto corto para la notificación del iPhone. */
	summary: string;
	duplicate?: boolean;
}

/** Compara la clave recibida con la guardada en tiempo constante (sin filtrar pistas por el tiempo de respuesta). */
async function isValidIngestKey(provided: string | undefined, expected: string | undefined): Promise<boolean> {
	if (!provided || !expected) return false;
	const encoder = new TextEncoder();
	const [a, b] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(provided)),
		crypto.subtle.digest("SHA-256", encoder.encode(expected)),
	]);
	return crypto.subtle.timingSafeEqual(a, b);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(raw);
		return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Los Atajos a veces mandan números en vez de texto, o campos vacíos. */
function asText(value: unknown): string | null {
	if (typeof value === "string") return value.trim() || null;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

interface WalletAccount {
	id: number;
	wallet_card_name: string;
	active: number;
}

// Lo que Wallet puede agregar después del nombre: puntos y últimos dígitos, p. ej. " •••• 1234".
const CARD_NUMBER_SUFFIX = /^[\s•·*.\d-]+$/;

/**
 * Busca la cuenta por el nombre que muestra Apple Wallet, sin distinguir mayúsculas ni tildes.
 * También coincide si después del nombre solo vienen puntos o dígitos. Las cuentas activas van primero.
 */
export function matchAccount(card: string, accounts: WalletAccount[]): WalletAccount | null {
	const target = normalizeText(card);
	const sorted = [...accounts].sort((a, b) => b.active - a.active);
	return (
		sorted.find((account) => normalizeText(account.wallet_card_name) === target) ??
		sorted.find((account) => {
			const name = normalizeText(account.wallet_card_name);
			return target.startsWith(name) && CARD_NUMBER_SUFFIX.test(target.slice(name.length));
		}) ??
		null
	);
}

function buildSummary(money: Money | null, merchant: string | null, categoryName: string | null, status: TransactionStatus) {
	const parts = [
		money ? formatMoney(money) : "Monto desconocido",
		merchant ?? "Sin comercio",
		status === "review" ? "Por revisar" : categoryName,
	].filter(Boolean);
	return `${status === "review" ? "⚠ " : ""}${parts.join(" · ")}`;
}

export const ingest = new Hono<AppEnv>();

ingest.use("*", async (c, next) => {
	if (!(await isValidIngestKey(c.req.header("X-Ingest-Key"), c.env.INGEST_KEY))) {
		return c.json<IngestResponse>({ ok: false, summary: "⚠ Clave del Atajo inválida: el pago no se guardó" }, 401);
	}
	await next();
});

/**
 * Llamado por el Atajo de Apple Pay. Todo lo que llega se guarda (sección 7.5): si falta algo o no se
 * entiende, queda "Por revisar" con el texto original en raw_payload.
 */
ingest.post("/apple-pay", async (c) => {
	const raw = (await c.req.text()).slice(0, MAX_RAW_PAYLOAD);
	const payload = parseJsonObject(raw);
	const merchantRaw = asText(payload?.merchant);
	const amountText = asText(payload?.amount_text ?? payload?.amount);
	const card = asText(payload?.card);
	const occurredText = asText(payload?.occurred_at);

	const money = amountText ? parseAmount(amountText) : null;
	const instant = (occurredText && parseOccurredAt(occurredText)) || new Date();

	try {
		const db = c.env.DB;
		const [walletAccounts, rules, others] = await Promise.all([
			db
				.prepare("SELECT id, wallet_card_name, active FROM accounts WHERE wallet_card_name IS NOT NULL")
				.all<WalletAccount>(),
			loadRules(db),
			db.prepare("SELECT id FROM categories WHERE name = 'Otros'").first<{ id: number }>(),
		]);

		const account = card ? matchAccount(card, walletAccounts.results) : null;
		const rule = merchantRaw ? findRule(merchantRaw, rules) : null;
		const type: TransactionType = rule?.type ?? rule?.category_kind ?? "expense";
		// Sin regla con categoría, el gasto va a "Otros" y queda por revisar (sección 7.4).
		const categoryId = rule?.category_id ?? (type === "expense" ? (others?.id ?? null) : null);
		const categoryName = rule?.category_id ? rule.category_name : null;
		const merchant = rule?.merchant_name ?? merchantRaw;
		const complete = Boolean(money && merchantRaw && account && rule?.category_id);
		const status: TransactionStatus = complete ? "ok" : "review";
		const amountMinor = money?.amountMinor ?? 0;

		const key = await dedupeKey({
			source: "apple_pay",
			accountId: account?.id ?? null,
			amountMinor,
			merchantRaw,
			occurredAt: instant,
		});

		const inserted = await db
			.prepare(
				`INSERT INTO transactions (occurred_at, local_date, amount_minor, currency, type, merchant_raw, merchant,
				   category_id, account_id, source, status, raw_payload, dedupe_key)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'apple_pay', ?, ?, ?)
				 ON CONFLICT (dedupe_key) DO NOTHING
				 RETURNING id`,
			)
			.bind(
				toBogotaIso(instant),
				toLocalDate(instant),
				amountMinor,
				money?.currency ?? "COP",
				type,
				merchantRaw,
				merchant,
				categoryId,
				account?.id ?? null,
				status,
				raw,
				key,
			)
			.first<{ id: number }>();

		if (!inserted) {
			// Ya existía: el Atajo lo mandó dos veces. Se responde con el original.
			const existing = await db
				.prepare("SELECT id, status FROM transactions WHERE dedupe_key = ?")
				.bind(key)
				.first<{ id: number; status: TransactionStatus }>();
			return c.json<IngestResponse>({
				ok: true,
				id: existing?.id,
				status: existing?.status,
				summary: `Ya registrado: ${buildSummary(money, merchant, categoryName, existing?.status ?? status)}`,
				duplicate: true,
			});
		}

		return c.json<IngestResponse>(
			{ ok: true, id: inserted.id, status, summary: buildSummary(money, merchant, categoryName, status) },
			201,
		);
	} catch (error) {
		console.error("Error guardando un pago de Apple Pay", error);
		return c.json<IngestResponse>(
			{ ok: false, summary: "⚠ No se pudo guardar el pago. Regístralo a mano en la app." },
			500,
		);
	}
});
