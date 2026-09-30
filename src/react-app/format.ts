import { toBogotaIso, toLocalDate } from "../shared/dates";
import type { Currency } from "../shared/money";

export { formatMoney } from "../shared/money";

/** Monto para poner en un campo de texto: 2500000 centavos COP → "25.000"; 1299 USD → "12,99". */
export function amountToInput(amountMinor: number, currency: Currency): string {
	const hasCents = currency !== "COP" || amountMinor % 100 !== 0;
	return new Intl.NumberFormat("es-CO", {
		minimumFractionDigits: hasCents ? 2 : 0,
		maximumFractionDigits: hasCents ? 2 : 0,
	}).format(amountMinor / 100);
}

/** Valor para <input type="datetime-local"> en hora de Bogotá: "2026-10-01T13:45". */
export function toDateTimeInput(instant: Date | string): string {
	const date = typeof instant === "string" ? new Date(instant) : instant;
	return toBogotaIso(date).slice(0, 16);
}

export function today(): string {
	return toLocalDate(new Date());
}

/** "YYYY-MM" del mes actual en Bogotá. */
export function currentMonth(): string {
	return today().slice(0, 7);
}

export function monthRange(month: string): { from: string; to: string } {
	const [year, monthNumber] = month.split("-").map(Number);
	const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
	const [year, monthNumber] = month.split("-").map(Number);
	const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
	return date.toISOString().slice(0, 7);
}

const compactFormat = new Intl.NumberFormat("es-CO", {
	style: "currency",
	currency: "COP",
	notation: "compact",
	maximumFractionDigits: 1,
});

/** Para ejes: 150000000 centavos → "$ 1,5 M". */
export function compactMoney(amountMinor: number): string {
	return compactFormat.format(amountMinor / 100);
}

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09" → "sep" */
export function shortMonthLabel(month: string): string {
	return SHORT_MONTHS[Number(month.slice(5, 7)) - 1];
}

const monthFormat = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

const monthNameFormat = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" });

/** "2026-08" → "agosto" */
export function monthName(month: string): string {
	return monthNameFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** "Septiembre de 2026" */
export function monthLabel(month: string): string {
	return capitalize(monthFormat.format(new Date(`${month}-01T00:00:00Z`)));
}

/** "Hoy", "Ayer" o "lunes, 28 de septiembre". */
export function dayLabel(localDate: string): string {
	const todayDate = today();
	if (localDate === todayDate) return "Hoy";
	const yesterday = toLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
	if (localDate === yesterday) return "Ayer";
	return capitalize(dayFormat.format(new Date(`${localDate}T00:00:00Z`)));
}
