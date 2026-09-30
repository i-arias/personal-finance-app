import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { AccountSpend, CategorySpend, MerchantSpend, MonthlyStats } from "../../shared/api";
import { useCatalog } from "../catalog";
import { BarList } from "../components/BarList";
import { MonthlyChart } from "../components/MonthlyChart";
import { MonthSelector } from "../components/MonthSelector";
import { Card, ErrorMessage, Loading, PageHeader } from "../components/ui";
import { currentMonth, monthRange } from "../format";
import { useApiData } from "../useApiData";

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card>
			<h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
			{children}
		</Card>
	);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Se exporta por defecto porque se carga aparte (React.lazy): así Recharts no retrasa el Inicio.
export default function AnalysisPage() {
	const [params, setParams] = useSearchParams();
	const month = params.get("month") ?? currentMonth();
	const { from, to } = monthRange(month);
	const range = `from=${from}&to=${to}`;
	const { categoryById, accountById } = useCatalog();

	const monthly = useApiData<MonthlyStats>("/api/stats/monthly?months=12");
	const byCategory = useApiData<CategorySpend[]>(`/api/stats/by-category?${range}`);
	const merchants = useApiData<MerchantSpend[]>(`/api/stats/top-merchants?${range}&limit=10`);
	const byAccount = useApiData<AccountSpend[]>(`/api/stats/by-account?${range}`);

	const selectMonth = (next: string) => setParams(next === currentMonth() ? {} : { month: next }, { replace: true });
	const total = byCategory.data?.reduce((sum, row) => sum + row.amount_minor, 0) ?? 0;
	const stale = byCategory.stale || merchants.stale || byAccount.stale;
	const error = monthly.error ?? byCategory.error ?? merchants.error ?? byAccount.error;
	const empty = <p className="text-sm text-slate-500">No hay gastos en este mes.</p>;

	return (
		<>
			<PageHeader title="Análisis" />
			<ErrorMessage>{error}</ErrorMessage>

			<Section title="Últimos 12 meses">
				{monthly.data ? (
					<>
						<p className="-mt-2 mb-2 text-xs text-slate-500">Toca una barra para ver ese mes abajo.</p>
						<MonthlyChart stats={monthly.data} categoryById={categoryById} onSelectMonth={selectMonth} />
					</>
				) : (
					<Loading />
				)}
			</Section>

			<div className="my-4">
				<MonthSelector month={month} onChange={selectMonth} />
			</div>

			{byCategory.loading ? (
				<Loading />
			) : (
				<div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
					<Section title="Por categoría">
						{byCategory.data?.length ? (
							<BarList
								total={total}
								items={byCategory.data.map((row) => ({
									key: String(row.category_id ?? "none"),
									label: row.category_id ? (categoryById.get(row.category_id)?.name ?? "Categoría") : "Sin categoría",
									detail: plural(row.count, "movimiento", "movimientos"),
									amountMinor: row.amount_minor,
									href: row.category_id ? `/movimientos?month=${month}&category_id=${row.category_id}` : undefined,
								}))}
							/>
						) : (
							empty
						)}
					</Section>

					<Section title="Top 10 comercios">
						{merchants.data?.length ? (
							<BarList
								total={total}
								items={merchants.data.map((row) => ({
									key: row.merchant,
									label: row.merchant,
									detail: plural(row.count, "compra", "compras"),
									amountMinor: row.amount_minor,
								}))}
							/>
						) : (
							empty
						)}
					</Section>

					<Section title="Por tarjeta o cuenta">
						{byAccount.data?.length ? (
							<BarList
								total={total}
								items={byAccount.data.map((row) => ({
									key: String(row.account_id ?? "none"),
									label: row.account_id ? (accountById.get(row.account_id)?.name ?? "Cuenta") : "Sin cuenta",
									detail: plural(row.count, "movimiento", "movimientos"),
									amountMinor: row.amount_minor,
									href: row.account_id ? `/movimientos?month=${month}&account_id=${row.account_id}` : undefined,
								}))}
							/>
						) : (
							empty
						)}
					</Section>
				</div>
			)}
		</>
	);
}
