import { Hono } from "hono";
import { z } from "zod";
import type {
	AccountSpend,
	CategorySpend,
	MerchantSpend,
	MonthlyCategorySpend,
	MonthlyStats,
	SummaryStats,
} from "../../shared/api";
import { toLocalDate } from "../../shared/dates";
import { queryParams } from "../lib/http";
import type { AppEnv } from "../types";

// Las estadísticas solo suman gastos reales en pesos: los "internal" nunca cuentan (sección 7.3)
// y los gastos en USD se muestran aparte hasta la Fase 7.
const EXPENSE_COP = "type = 'expense' AND currency = 'COP'";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Debe tener el formato YYYY-MM");

const rangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() });

function daysInMonth(month: string): number {
	const [year, monthNumber] = month.split("-").map(Number);
	return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function shiftMonth(month: string, delta: number): string {
	const [year, monthNumber] = month.split("-").map(Number);
	return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

function dayOf(month: string, day: number): string {
	return `${month}-${String(day).padStart(2, "0")}`;
}

async function sumExpenses(db: D1Database, from: string, to: string, currency = "COP"): Promise<number> {
	const row = await db
		.prepare(
			"SELECT COALESCE(SUM(amount_minor), 0) AS total FROM transactions WHERE type = 'expense' AND currency = ? AND local_date BETWEEN ? AND ?",
		)
		.bind(currency, from, to)
		.first<{ total: number }>();
	return row?.total ?? 0;
}

export const stats = new Hono<AppEnv>();

stats.get("/summary", queryParams(z.object({ month: monthSchema })), async (c) => {
	const { month } = c.req.valid("query");
	const today = toLocalDate(new Date());
	const currentMonth = today.slice(0, 7);
	const totalDays = daysInMonth(month);
	// Días transcurridos: el mes actual va hasta hoy; un mes pasado, completo; uno futuro, cero.
	const daysElapsed =
		month < currentMonth ? totalDays : month === currentMonth ? Number(today.slice(8, 10)) : 0;

	const from = dayOf(month, 1);
	const to = dayOf(month, totalDays);
	const previousMonth = shiftMonth(month, -1);
	const previousDays = daysInMonth(previousMonth);
	const previousFrom = dayOf(previousMonth, 1);
	// "Mismo periodo" del mes anterior: del 1 al mismo día (o hasta su último día si es más corto).
	const previousSamePeriodTo = dayOf(previousMonth, Math.min(Math.max(daysElapsed, 1), previousDays));

	const [expense, usdExpense, previousSamePeriod, previousTotal, review] = await Promise.all([
		sumExpenses(c.env.DB, from, to),
		sumExpenses(c.env.DB, from, to, "USD"),
		daysElapsed > 0 ? sumExpenses(c.env.DB, previousFrom, previousSamePeriodTo) : Promise.resolve(0),
		sumExpenses(c.env.DB, previousFrom, dayOf(previousMonth, previousDays)),
		c.env.DB.prepare("SELECT COUNT(*) AS count FROM transactions WHERE status = 'review'").first<{ count: number }>(),
	]);

	const dailyAverage = daysElapsed > 0 ? Math.round(expense / daysElapsed) : 0;
	const summary: SummaryStats = {
		month,
		days_in_month: totalDays,
		days_elapsed: daysElapsed,
		expense_minor: expense,
		usd_expense_minor: usdExpense,
		previous_month: previousMonth,
		previous_same_period_minor: previousSamePeriod,
		previous_total_minor: previousTotal,
		daily_average_minor: dailyAverage,
		// Solo tiene sentido proyectar el mes en curso.
		projection_minor: month === currentMonth ? dailyAverage * totalDays : null,
		review_count: review?.count ?? 0,
	};
	return c.json(summary);
});

stats.get("/by-category", queryParams(rangeSchema), async (c) => {
	const { from, to } = c.req.valid("query");
	const { results } = await c.env.DB.prepare(
		`SELECT category_id, SUM(amount_minor) AS amount_minor, COUNT(*) AS count
		 FROM transactions WHERE ${EXPENSE_COP} AND local_date BETWEEN ? AND ?
		 GROUP BY category_id ORDER BY amount_minor DESC, category_id`,
	)
		.bind(from, to)
		.all<CategorySpend>();
	return c.json(results);
});

stats.get(
	"/monthly",
	queryParams(z.object({ months: z.coerce.number().int().min(1).max(24).default(12) })),
	async (c) => {
		const { months: count } = c.req.valid("query");
		const lastMonth = toLocalDate(new Date()).slice(0, 7);
		const months = Array.from({ length: count }, (_, i) => shiftMonth(lastMonth, i - count + 1));
		const { results } = await c.env.DB.prepare(
			`SELECT substr(local_date, 1, 7) AS month, category_id, SUM(amount_minor) AS amount_minor
			 FROM transactions WHERE ${EXPENSE_COP} AND local_date BETWEEN ? AND ?
			 GROUP BY month, category_id ORDER BY month, category_id`,
		)
			.bind(dayOf(months[0], 1), dayOf(lastMonth, daysInMonth(lastMonth)))
			.all<MonthlyCategorySpend>();
		const body: MonthlyStats = { months, rows: results };
		return c.json(body);
	},
);

stats.get(
	"/top-merchants",
	queryParams(rangeSchema.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) })),
	async (c) => {
		const { from, to, limit } = c.req.valid("query");
		const { results } = await c.env.DB.prepare(
			`SELECT COALESCE(merchant, merchant_raw) AS merchant, SUM(amount_minor) AS amount_minor, COUNT(*) AS count
			 FROM transactions
			 WHERE ${EXPENSE_COP} AND local_date BETWEEN ? AND ? AND COALESCE(merchant, merchant_raw) IS NOT NULL
			 GROUP BY COALESCE(merchant, merchant_raw) ORDER BY amount_minor DESC, merchant LIMIT ?`,
		)
			.bind(from, to, limit)
			.all<MerchantSpend>();
		return c.json(results);
	},
);

stats.get("/by-account", queryParams(rangeSchema), async (c) => {
	const { from, to } = c.req.valid("query");
	const { results } = await c.env.DB.prepare(
		`SELECT account_id, SUM(amount_minor) AS amount_minor, COUNT(*) AS count
		 FROM transactions WHERE ${EXPENSE_COP} AND local_date BETWEEN ? AND ?
		 GROUP BY account_id ORDER BY amount_minor DESC, account_id`,
	)
		.bind(from, to)
		.all<AccountSpend>();
	return c.json(results);
});
