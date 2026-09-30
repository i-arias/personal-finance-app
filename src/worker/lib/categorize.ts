import type { Rule, TransactionType } from "../../shared/api";
import { normalizeText } from "./text";

/** Una regla con los datos de su categoría (si tiene). */
export interface RuleWithCategory extends Rule {
	category_name: string | null;
	category_kind: TransactionType | null;
}

export async function loadRules(db: D1Database): Promise<RuleWithCategory[]> {
	const { results } = await db
		.prepare(
			`SELECT r.id, r.pattern, r.merchant_name, r.category_id, r.type, r.priority,
			        c.name AS category_name, c.kind AS category_kind
			 FROM rules r LEFT JOIN categories c ON c.id = r.category_id
			 ORDER BY r.priority, r.id`,
		)
		.all<RuleWithCategory>();
	return results;
}

/**
 * La primera regla (menor prioridad; si empatan, la más antigua) cuyo patrón aparece en el comercio,
 * sin distinguir mayúsculas ni tildes (sección 7.4).
 */
export function findRule<T extends Rule>(merchantRaw: string, rules: T[]): T | null {
	const merchant = normalizeText(merchantRaw);
	const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
	return (
		sorted.find((rule) => {
			const pattern = normalizeText(rule.pattern);
			return pattern !== "" && merchant.includes(pattern);
		}) ?? null
	);
}
