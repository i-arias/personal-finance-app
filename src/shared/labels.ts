import type { AccountType, TransactionSource, TransactionStatus, TransactionType } from "./api";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
	expense: "Gasto",
	income: "Ingreso",
	internal: "Interno",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	credit_card: "Tarjeta de crédito",
	debit_card: "Tarjeta débito",
	savings: "Cuenta de ahorros",
	wallet: "Billetera (Nequi, Daviplata…)",
	cash: "Efectivo",
};

export const SOURCE_LABELS: Record<TransactionSource, string> = {
	apple_pay: "Apple Pay",
	sms: "SMS",
	email: "Correo",
	receipt: "Comprobante",
	manual: "Manual",
	csv: "CSV",
};

export const STATUS_LABELS: Record<TransactionStatus, string> = {
	ok: "OK",
	review: "Por revisar",
};
