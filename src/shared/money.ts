export type Currency = "COP" | "USD";

export interface Money {
	amountMinor: number; // centavos
	currency: Currency;
}

const USD_MARKER = /US\$|U\$S|USD/i;
const COP_MARKER = /COP|\$/i;
const CURRENCY_MARKERS = /US\$|U\$S|USD|COP|\$/gi;
const NUMBER_WITH_SEPARATORS = /^\d(?:[\d.,]*\d)?$/;

/**
 * Convierte un monto en texto a centavos. Acepta formato colombiano ("$25.000,00")
 * y estadounidense ("$25,000.00"), porque iOS puede entregar cualquiera de los dos.
 *
 * Regla de separadores: si el último "." o "," va seguido de 1 o 2 dígitos, es el decimal;
 * en cualquier otro caso, todos los separadores son de miles.
 *
 * Devuelve null si el texto no es un monto mayor que cero.
 */
export function parseAmount(text: string, defaultCurrency: Currency = "COP"): Money | null {
	const currency: Currency = USD_MARKER.test(text) ? "USD" : COP_MARKER.test(text) ? "COP" : defaultCurrency;
	const number = text.replace(CURRENCY_MARKERS, "").replace(/\s/g, "");
	if (!NUMBER_WITH_SEPARATORS.test(number)) return null;

	let integerPart = number;
	let fractionPart = "";
	const lastSeparator = Math.max(number.lastIndexOf("."), number.lastIndexOf(","));
	if (lastSeparator !== -1 && number.length - lastSeparator - 1 <= 2) {
		integerPart = number.slice(0, lastSeparator);
		fractionPart = number.slice(lastSeparator + 1);
	}

	const units = Number(integerPart.replace(/[.,]/g, ""));
	const cents = Number(fractionPart.padEnd(2, "0"));
	const amountMinor = units * 100 + cents;
	if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
	return { amountMinor, currency };
}

/** Formato para mostrar: "$ 25.000" en COP (sin decimales) y "US$ 12,99" en USD. */
export function formatMoney({ amountMinor, currency }: Money): string {
	const fractionDigits = currency === "COP" ? 0 : 2;
	return new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(amountMinor / 100);
}
