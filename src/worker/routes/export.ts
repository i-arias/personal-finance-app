import { Hono } from "hono";
import type { TransactionSource, TransactionStatus, TransactionType } from "../../shared/api";
import { toLocalDate } from "../../shared/dates";
import { SOURCE_LABELS, STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "../../shared/labels";
import type { Currency } from "../../shared/money";
import { queryParams } from "../lib/http";
import type { AppEnv } from "../types";
import { buildFilters, filtersSchema, whereClause } from "./transactions";

interface ExportRow {
	local_date: string;
	time: string;
	type: TransactionType;
	amount_minor: number;
	currency: Currency;
	merchant: string | null;
	category: string | null;
	account: string | null;
	status: TransactionStatus;
	source: TransactionSource;
	note: string | null;
}

const HEADER = ["Fecha", "Hora", "Tipo", "Monto", "Moneda", "Comercio", "Categoría", "Cuenta", "Estado", "Origen", "Nota"];

/** Monto con coma decimal, como lo lee Excel en español: 25000 COP → "25000"; 12,99 USD → "12,99". */
export function formatCsvAmount(amountMinor: number, currency: Currency): string {
	const units = Math.trunc(amountMinor / 100);
	const cents = amountMinor % 100;
	if (currency === "COP" && cents === 0) return String(units);
	return `${units},${String(cents).padStart(2, "0")}`;
}

/** Escapa un campo para CSV separado por ";" y evita que Excel lo interprete como fórmula. */
export function csvField(value: string | null): string {
	if (value === null) return "";
	const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const exportCsv = new Hono<AppEnv>();

exportCsv.get("/", queryParams(filtersSchema), async (c) => {
	const filters = c.req.valid("query");
	const { conditions, params } = buildFilters(filters, "t.");
	const { results } = await c.env.DB.prepare(
		`SELECT t.local_date, substr(t.occurred_at, 12, 5) AS time, t.type, t.amount_minor, t.currency,
		        COALESCE(t.merchant, t.merchant_raw) AS merchant, c.name AS category, a.name AS account,
		        t.status, t.source, t.note
		 FROM transactions t
		 LEFT JOIN categories c ON c.id = t.category_id
		 LEFT JOIN accounts a ON a.id = t.account_id
		 ${whereClause(conditions)}
		 ORDER BY t.occurred_at, t.id`,
	)
		.bind(...params)
		.all<ExportRow>();

	const lines = [
		HEADER.join(";"),
		...results.map((row) =>
			[
				row.local_date,
				row.time,
				TRANSACTION_TYPE_LABELS[row.type],
				formatCsvAmount(row.amount_minor, row.currency),
				row.currency,
				row.merchant,
				row.category,
				row.account,
				STATUS_LABELS[row.status],
				SOURCE_LABELS[row.source],
				row.note,
			]
				.map(csvField)
				.join(";"),
		),
	];

	const filename = `movimientos_${filters.from ?? "inicio"}_${filters.to ?? toLocalDate(new Date())}.csv`;
	// El BOM de UTF-8 hace que Excel lea bien las tildes.
	const BOM = String.fromCharCode(0xfeff);
	return c.body(`${BOM}${lines.join("\r\n")}\r\n`, 200, {
		"Content-Type": "text/csv; charset=utf-8",
		"Content-Disposition": `attachment; filename="${filename}"`,
	});
});
