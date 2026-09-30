import { describe, expect, it } from "vitest";
import { formatMoney, parseAmount } from "../src/shared/money";

describe("parseAmount", () => {
	// Tabla de la sección 7.1 del CLAUDE.md.
	it.each([
		["$25.000", 2_500_000, "COP"],
		["$ 25.000,00", 2_500_000, "COP"],
		["COP 1.234.567", 123_456_700, "COP"],
		["$25,000.00", 2_500_000, "COP"],
		["US$12.99", 1_299, "USD"],
		["USD 12,99", 1_299, "USD"],
		["12.5", 1_250, "COP"],
	])("%s → %i centavos %s", (text, amountMinor, currency) => {
		expect(parseAmount(text)).toEqual({ amountMinor, currency });
	});

	it.each(["", "0", "$0", "0,00", "   "])("%j es inválido", (text) => {
		expect(parseAmount(text)).toBeNull();
	});

	it.each([
		["25.000 COP", 2_500_000, "COP"],
		["US$ 1,234.56", 123_456, "USD"],
		["1,5", 150, "COP"],
		["$ 25.000", 2_500_000, "COP"], // espacio duro, como lo escribe Intl
		["1.234", 123_400, "COP"], // 3 dígitos después del separador: miles
		["$1.000.000,5", 100_000_050, "COP"],
	])("%s → %i centavos %s", (text, amountMinor, currency) => {
		expect(parseAmount(text)).toEqual({ amountMinor, currency });
	});

	it.each(["abc", "$", "25.000,", ",50", "-25.000", "25 mil", "1.2.3,4,5x"])("%j es inválido", (text) => {
		expect(parseAmount(text)).toBeNull();
	});

	it("usa la moneda por defecto cuando el texto no la indica", () => {
		expect(parseAmount("12.99", "USD")).toEqual({ amountMinor: 1_299, currency: "USD" });
	});
});

describe("formatMoney", () => {
	const normalizeSpaces = (text: string) => text.replace(/\s/g, " ");

	it("formatea COP sin decimales", () => {
		expect(normalizeSpaces(formatMoney({ amountMinor: 2_500_000, currency: "COP" }))).toBe("$ 25.000");
		expect(normalizeSpaces(formatMoney({ amountMinor: 123_456_700, currency: "COP" }))).toBe("$ 1.234.567");
	});

	it("formatea USD con dos decimales", () => {
		expect(normalizeSpaces(formatMoney({ amountMinor: 1_299, currency: "USD" }))).toBe("US$ 12,99");
	});
});
