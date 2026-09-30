// Colombia (America/Bogota) está en UTC−5 todo el año: no tiene horario de verano.
const BOGOTA_OFFSET = "-05:00";
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

const ISO_DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** El instante en hora de Bogotá, ej. "2026-10-01T13:45:00-05:00". Se guarda así en occurred_at. */
export function toBogotaIso(instant: Date): string {
	const shifted = new Date(instant.getTime() + BOGOTA_OFFSET_MS);
	return shifted.toISOString().slice(0, 19) + BOGOTA_OFFSET;
}

/** Día (YYYY-MM-DD) del instante en hora de Bogotá. Se guarda en local_date para agrupar. */
export function toLocalDate(instant: Date): string {
	return toBogotaIso(instant).slice(0, 10);
}

/**
 * Interpreta una fecha ISO 8601 que llega a la API. Si no trae zona horaria, se asume hora de Bogotá.
 * Devuelve null si el texto no es una fecha válida.
 */
export function parseOccurredAt(text: string): Date | null {
	const match = ISO_DATE_TIME.exec(text.trim());
	if (!match) return null;

	const [, year, month, day, hour, minute, second = "00", offset] = match;
	// Date normalizaría fechas imposibles (31 de febrero → 3 de marzo); aquí se rechazan.
	const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	if (calendarDay.getUTCMonth() !== Number(month) - 1 || calendarDay.getUTCDate() !== Number(day)) {
		return null;
	}

	const zone = offset ? normalizeOffset(offset) : BOGOTA_OFFSET;
	const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`);
	return Number.isNaN(instant.getTime()) ? null : instant;
}

function normalizeOffset(offset: string): string {
	if (offset.toUpperCase() === "Z") return "Z";
	return offset.includes(":") ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;
}
