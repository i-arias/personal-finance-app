// Tipos y valores que comparten la API (src/worker) y el frontend (src/react-app).
import type { Currency } from "./money";

export const CURRENCIES = ["COP", "USD"] as const satisfies readonly Currency[];

export const TRANSACTION_TYPES = ["expense", "income", "internal"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = ["apple_pay", "sms", "email", "receipt", "manual", "csv"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const TRANSACTION_STATUSES = ["ok", "review"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const ACCOUNT_TYPES = ["credit_card", "debit_card", "savings", "wallet", "cash"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Transaction {
	id: number;
	occurred_at: string;
	local_date: string;
	amount_minor: number;
	currency: Currency;
	type: TransactionType;
	merchant_raw: string | null;
	merchant: string | null;
	category_id: number | null;
	account_id: number | null;
	source: TransactionSource;
	status: TransactionStatus;
	note: string | null;
	created_at: string;
}

/** GET /api/transactions/:id: además trae el texto original que llegó (Atajo, SMS, correo). */
export interface TransactionDetail extends Transaction {
	raw_payload: string | null;
}

export interface TransactionTotal {
	type: TransactionType;
	currency: Currency;
	amount_minor: number;
}

export interface TransactionPage {
	items: Transaction[];
	next_cursor: string | null;
	/** Solo viene en la primera página (sin cursor). */
	totals: TransactionTotal[] | null;
}

export interface Category {
	id: number;
	name: string;
	kind: TransactionType;
	color: string | null;
	monthly_budget: number | null; // en pesos
}

export interface Account {
	id: number;
	name: string;
	institution: string | null;
	type: AccountType;
	wallet_card_name: string | null;
	currency: Currency;
	active: boolean;
}

export interface Rule {
	id: number;
	pattern: string;
	merchant_name: string | null;
	category_id: number | null;
	type: TransactionType | null;
	priority: number;
}

// Estadísticas (Fase 4). Solo gastos en COP, salvo usd_expense_minor.

export interface SummaryStats {
	month: string; // YYYY-MM
	days_in_month: number;
	days_elapsed: number; // mes actual: hasta hoy; mes pasado: completo; mes futuro: 0
	expense_minor: number;
	usd_expense_minor: number;
	previous_month: string;
	/** Gasto del mes anterior del día 1 al mismo día transcurrido de este mes. */
	previous_same_period_minor: number;
	previous_total_minor: number;
	daily_average_minor: number;
	/** Solo para el mes en curso. */
	projection_minor: number | null;
	/** Movimientos por revisar en total, no solo de este mes. */
	review_count: number;
}

export interface CategorySpend {
	category_id: number | null;
	amount_minor: number;
	count: number;
}

export interface MonthlyCategorySpend {
	month: string;
	category_id: number | null;
	amount_minor: number;
}

export interface MonthlyStats {
	months: string[]; // los últimos N meses, del más antiguo al actual
	rows: MonthlyCategorySpend[];
}

export interface MerchantSpend {
	merchant: string;
	amount_minor: number;
	count: number;
}

export interface AccountSpend {
	account_id: number | null;
	amount_minor: number;
	count: number;
}

export interface ApiError {
	ok: false;
	error: string;
	message?: string;
}
