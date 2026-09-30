import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
	Account,
	AccountSpend,
	CategorySpend,
	MerchantSpend,
	MonthlyStats,
	SummaryStats,
} from "../src/shared/api";
import { api, categoryId, createAccount } from "./helpers";

let mercado: number;
let restaurantes: number;
let visa: Account;
let debito: Account;

function create(body: Record<string, unknown>) {
	return api("/api/transactions", { method: "POST", body });
}

beforeAll(async () => {
	mercado = await categoryId("Mercado");
	restaurantes = await categoryId("Restaurantes y domicilios");
	const pagoTarjeta = await categoryId("Pago de tarjeta de crédito");
	const salario = await categoryId("Salario");
	visa = await createAccount("Visa ficticia");
	debito = await createAccount("Débito ficticio");

	// Marzo de 2020: 200.000 COP en gastos, más movimientos que NO deben sumar.
	await create({ amount: "100.000", occurred_at: "2020-03-02T10:00", merchant: "Éxito", category_id: mercado, account_id: visa.id });
	await create({ amount: "50.000", occurred_at: "2020-03-15T10:00", merchant: "Éxito", category_id: mercado, account_id: debito.id });
	await create({ amount: "30.000", occurred_at: "2020-03-20T21:30", merchant: "Rappi", category_id: restaurantes, account_id: visa.id });
	await create({ amount: "20.000", occurred_at: "2020-03-31T23:00", merchant: "Tienda" }); // sin categoría ni cuenta → por revisar
	await create({ amount: "500.000", type: "internal", occurred_at: "2020-03-05T10:00", category_id: pagoTarjeta });
	await create({ amount: "3.000.000", type: "income", occurred_at: "2020-03-01T10:00", category_id: salario });
	await create({ amount: "12.99", currency: "USD", occurred_at: "2020-03-10T10:00", merchant: "App Store" }); // por revisar

	// Febrero de 2020 (bisiesto): 100.000 COP.
	await create({ amount: "40.000", occurred_at: "2020-02-10T10:00", category_id: mercado });
	await create({ amount: "60.000", occurred_at: "2020-02-29T10:00", category_id: mercado });
});

afterEach(() => {
	vi.useRealTimers();
});

describe("GET /api/stats/summary", () => {
	it("resume un mes pasado: solo gastos en COP, USD aparte y sin proyección", async () => {
		const { status, body } = await api<SummaryStats>("/api/stats/summary?month=2020-03");
		expect(status).toBe(200);
		expect(body).toEqual({
			month: "2020-03",
			days_in_month: 31,
			days_elapsed: 31,
			expense_minor: 20_000_000,
			usd_expense_minor: 1_299,
			previous_month: "2020-02",
			previous_same_period_minor: 10_000_000, // febrero completo (29 días < 31)
			previous_total_minor: 10_000_000,
			daily_average_minor: Math.round(20_000_000 / 31),
			projection_minor: null,
			review_count: 2,
		});
	});

	it("en el mes en curso compara hasta el mismo día y proyecta el fin de mes", async () => {
		await create({ amount: "5.000", occurred_at: "2020-04-02T10:00", category_id: mercado });
		await create({ amount: "7.000", occurred_at: "2020-04-08T10:00", category_id: mercado });
		await create({ amount: "10.000", occurred_at: "2020-05-01T10:00", category_id: mercado });
		await create({ amount: "20.000", occurred_at: "2020-05-04T10:00", category_id: mercado });

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2020-05-05T17:00:00Z")); // 12:00 m. del 5 de mayo en Bogotá

		const { body } = await api<SummaryStats>("/api/stats/summary?month=2020-05");
		expect(body).toMatchObject({
			days_elapsed: 5,
			expense_minor: 3_000_000,
			previous_same_period_minor: 500_000, // 1 al 5 de abril
			previous_total_minor: 1_200_000,
			daily_average_minor: 600_000,
			projection_minor: 600_000 * 31,
		});
	});

	it("un mes futuro no tiene días transcurridos", async () => {
		const { body } = await api<SummaryStats>("/api/stats/summary?month=2099-01");
		expect(body).toMatchObject({ days_elapsed: 0, expense_minor: 0, daily_average_minor: 0, projection_minor: null });
	});

	it("rechaza un mes inválido", async () => {
		expect((await api("/api/stats/summary?month=2020-13")).status).toBe(400);
		expect((await api("/api/stats/summary")).status).toBe(400);
	});
});

describe("GET /api/stats/by-category", () => {
	it("suma por categoría de mayor a menor, incluyendo los movimientos sin categoría", async () => {
		const { body } = await api<CategorySpend[]>("/api/stats/by-category?from=2020-03-01&to=2020-03-31");
		expect(body).toEqual([
			{ category_id: mercado, amount_minor: 15_000_000, count: 2 },
			{ category_id: restaurantes, amount_minor: 3_000_000, count: 1 },
			{ category_id: null, amount_minor: 2_000_000, count: 1 },
		]);
	});

	it("exige el rango de fechas", async () => {
		expect((await api("/api/stats/by-category?from=2020-03-01")).status).toBe(400);
	});
});

describe("GET /api/stats/monthly", () => {
	it("devuelve los últimos 12 meses y el gasto por mes y categoría", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2020-03-15T17:00:00Z"));

		const { body } = await api<MonthlyStats>("/api/stats/monthly");
		expect(body.months).toHaveLength(12);
		expect(body.months[0]).toBe("2019-04");
		expect(body.months.at(-1)).toBe("2020-03");
		expect(body.rows).toEqual([
			{ month: "2020-02", category_id: mercado, amount_minor: 10_000_000 },
			{ month: "2020-03", category_id: null, amount_minor: 2_000_000 },
			{ month: "2020-03", category_id: mercado, amount_minor: 15_000_000 },
			{ month: "2020-03", category_id: restaurantes, amount_minor: 3_000_000 },
		]);
	});

	it("acepta otro número de meses", async () => {
		const { body } = await api<MonthlyStats>("/api/stats/monthly?months=3");
		expect(body.months).toHaveLength(3);
	});
});

describe("GET /api/stats/top-merchants", () => {
	it("agrupa por comercio y respeta el límite", async () => {
		const range = "from=2020-03-01&to=2020-03-31";
		const { body } = await api<MerchantSpend[]>(`/api/stats/top-merchants?${range}`);
		expect(body).toEqual([
			{ merchant: "Éxito", amount_minor: 15_000_000, count: 2 },
			{ merchant: "Rappi", amount_minor: 3_000_000, count: 1 },
			{ merchant: "Tienda", amount_minor: 2_000_000, count: 1 },
		]);

		const limited = await api<MerchantSpend[]>(`/api/stats/top-merchants?${range}&limit=1`);
		expect(limited.body.map((m) => m.merchant)).toEqual(["Éxito"]);
	});
});

describe("GET /api/stats/by-account", () => {
	it("suma por cuenta, con los movimientos sin cuenta aparte", async () => {
		const { body } = await api<AccountSpend[]>("/api/stats/by-account?from=2020-03-01&to=2020-03-31");
		expect(body).toEqual([
			{ account_id: visa.id, amount_minor: 13_000_000, count: 2 },
			{ account_id: debito.id, amount_minor: 5_000_000, count: 1 },
			{ account_id: null, amount_minor: 2_000_000, count: 1 },
		]);
	});
});
