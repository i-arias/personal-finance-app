import { toBogotaIso } from "../../shared/dates";
import { normalizeText } from "./text";

export interface DedupeParts {
	source: string;
	accountId: number | null;
	amountMinor: number;
	merchantRaw: string | null;
	occurredAt: Date;
}

/**
 * Hash de fuente, cuenta, monto, comercio normalizado y fecha redondeada al minuto (sección 7.6).
 * Si el Atajo manda el mismo pago dos veces, la segunda choca con la columna UNIQUE dedupe_key.
 */
export async function dedupeKey(parts: DedupeParts): Promise<string> {
	const minute = toBogotaIso(parts.occurredAt).slice(0, 16);
	const text = [
		parts.source,
		parts.accountId ?? "",
		parts.amountMinor,
		normalizeText(parts.merchantRaw ?? ""),
		minute,
	].join("|");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
