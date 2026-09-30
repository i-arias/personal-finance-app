import { describe, expect, it } from "vitest";
import type { Rule } from "../src/shared/api";
import { findRule } from "../src/worker/lib/categorize";
import { dedupeKey } from "../src/worker/lib/dedupe";
import { normalizeText } from "../src/worker/lib/text";
import { matchAccount } from "../src/worker/routes/ingest";

function rule(id: number, pattern: string, priority = 100): Rule {
	return { id, pattern, merchant_name: null, category_id: null, type: null, priority };
}

describe("normalizeText", () => {
	it.each([
		["  ÉXITO   Laureles ", "exito laureles"],
		["Droguería Cafam", "drogueria cafam"],
		["PEÑA", "pena"],
	])("%j → %j", (input, expected) => {
		expect(normalizeText(input)).toBe(expected);
	});
});

describe("findRule", () => {
	const rules = [rule(1, "rappi", 50), rule(2, "RAPPI PRIME", 10), rule(3, "éxito"), rule(4, "cafe"), rule(5, "cafe", 100)];

	it("encuentra el patrón en cualquier parte del comercio", () => {
		expect(findRule("PAGO RAPPI COLOMBIA", rules)?.id).toBe(1);
	});

	it("gana la menor prioridad", () => {
		expect(findRule("RAPPI PRIME MENSUAL", rules)?.id).toBe(2);
	});

	it("con la misma prioridad gana la regla más antigua", () => {
		expect(findRule("CAFE LA ESQUINA", rules)?.id).toBe(4);
	});

	it("no distingue tildes ni mayúsculas", () => {
		expect(findRule("EXITO COLOMBIA", rules)?.id).toBe(3);
	});

	it("devuelve null si ninguna aplica o el patrón está vacío", () => {
		expect(findRule("UBER", rules)).toBeNull();
		expect(findRule("UBER", [rule(9, "   ")])).toBeNull();
	});
});

describe("matchAccount", () => {
	const accounts = [
		{ id: 1, wallet_card_name: "VISA ORO FICTICIA", active: 1 },
		{ id: 2, wallet_card_name: "Debito Ficticio Virtual", active: 1 },
		{ id: 3, wallet_card_name: "Visa", active: 0 },
	];

	it("coincide sin importar mayúsculas", () => {
		expect(matchAccount("visa oro ficticia", accounts)?.id).toBe(1);
		expect(matchAccount("Débito Ficticio Virtual", accounts)?.id).toBe(2);
	});

	it("coincide aunque Wallet agregue puntos y dígitos al final", () => {
		expect(matchAccount("VISA ORO FICTICIA •••• 0000", accounts)?.id).toBe(1);
		expect(matchAccount("Visa ****0000", accounts)?.id).toBe(3);
	});

	it("la coincidencia exacta gana, aunque la cuenta esté inactiva", () => {
		expect(matchAccount("Visa", accounts)?.id).toBe(3);
	});

	it("no confunde una tarjeta con otra que empieza igual", () => {
		expect(matchAccount("Visa Otra", accounts)).toBeNull();
		expect(matchAccount("VISA ORO FICTICI", accounts)).toBeNull();
		expect(matchAccount("Amex", accounts)).toBeNull();
	});
});

describe("dedupeKey", () => {
	const base = {
		source: "apple_pay",
		accountId: 1,
		amountMinor: 2_500_000,
		merchantRaw: "RAPPI COLOMBIA",
		occurredAt: new Date("2030-10-01T21:45:10-05:00"),
	};

	it("es igual dentro del mismo minuto y con el comercio escrito distinto", async () => {
		const other = { ...base, merchantRaw: "  rappi   colombia ", occurredAt: new Date("2030-10-01T21:45:59-05:00") };
		expect(await dedupeKey(other)).toBe(await dedupeKey(base));
	});

	it.each([
		["otro minuto", { occurredAt: new Date("2030-10-01T21:46:00-05:00") }],
		["otro monto", { amountMinor: 2_500_100 }],
		["otra cuenta", { accountId: 2 }],
		["otro comercio", { merchantRaw: "UBER" }],
		["otra fuente", { source: "sms" }],
	])("cambia con %s", async (_, change) => {
		expect(await dedupeKey({ ...base, ...change })).not.toBe(await dedupeKey(base));
	});
});
