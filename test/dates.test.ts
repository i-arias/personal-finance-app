import { describe, expect, it } from "vitest";
import { parseOccurredAt, toBogotaIso, toLocalDate } from "../src/shared/dates";

describe("toLocalDate", () => {
	it.each([
		["2026-10-02T01:30:00Z", "2026-10-01"], // 8:30 p. m. en Bogotá: sigue siendo el 1
		["2026-10-02T04:59:59Z", "2026-10-01"], // 11:59:59 p. m. en Bogotá
		["2026-10-02T05:00:00Z", "2026-10-02"], // medianoche en Bogotá
		["2027-01-01T03:00:00Z", "2026-12-31"], // cambio de año
	])("%s → %s", (utc, localDate) => {
		expect(toLocalDate(new Date(utc))).toBe(localDate);
	});
});

describe("toBogotaIso", () => {
	it("expresa el instante en hora de Bogotá", () => {
		expect(toBogotaIso(new Date("2026-10-01T18:45:00Z"))).toBe("2026-10-01T13:45:00-05:00");
	});
});

describe("parseOccurredAt", () => {
	it.each([
		["2026-10-01T13:45:00-05:00", "2026-10-01T18:45:00.000Z"],
		["2026-10-01T13:45:00-0500", "2026-10-01T18:45:00.000Z"],
		["2026-10-01T18:45:00Z", "2026-10-01T18:45:00.000Z"],
		["2026-10-01T18:45:00.123+00:00", "2026-10-01T18:45:00.000Z"],
		["2026-10-01T13:45", "2026-10-01T18:45:00.000Z"], // sin zona: hora de Bogotá
		["2026-10-01 13:45:00", "2026-10-01T18:45:00.000Z"],
	])("%s → %s", (text, utc) => {
		expect(parseOccurredAt(text)?.toISOString()).toBe(utc);
	});

	it("una compra a las 9:15 p. m. queda en el día correcto", () => {
		const instant = parseOccurredAt("2026-10-01T21:15:00-05:00");
		expect(instant).not.toBeNull();
		expect(toLocalDate(instant!)).toBe("2026-10-01");
		expect(toBogotaIso(instant!)).toBe("2026-10-01T21:15:00-05:00");
	});

	it.each(["", "ayer", "2026-10-01", "2026-02-31T10:00:00-05:00", "2026-13-01T10:00:00-05:00", "2026-10-01T25:00:00-05:00"])(
		"%j es inválido",
		(text) => {
			expect(parseOccurredAt(text)).toBeNull();
		},
	);
});
