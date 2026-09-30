import { Link, useSearchParams } from "react-router";
import type { CategorySpend, SummaryStats } from "../../shared/api";
import { useCatalog } from "../catalog";
import { BudgetMeter } from "../components/BudgetMeter";
import { MonthSelector } from "../components/MonthSelector";
import { Card, ErrorMessage, Loading } from "../components/ui";
import { currentMonth, formatMoney, monthName, monthRange } from "../format";
import { useApiData } from "../useApiData";

const cop = (amountMinor: number) => formatMoney({ amountMinor, currency: "COP" });
const percentFormat = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

/** Comparación con el mes anterior. Gastar más es malo: rojo con ▲; gastar menos, verde con ▼. */
function Comparison({ summary }: { summary: SummaryStats }) {
	const previous = summary.previous_same_period_minor;
	const isFullMonth = summary.days_elapsed >= summary.days_in_month;
	const period = isFullMonth
		? `en ${monthName(summary.previous_month)}`
		: `del 1 al ${summary.days_elapsed} de ${monthName(summary.previous_month)}`;

	if (summary.days_elapsed === 0) return null;
	if (previous === 0) {
		return <p className="mt-2 text-sm text-slate-500">Sin gastos {period} para comparar.</p>;
	}

	const change = (summary.expense_minor - previous) / previous;
	const rounded = Math.round(change * 100);
	return (
		<p className="mt-2 text-sm text-slate-600">
			{rounded === 0 ? (
				<span className="font-semibold">Igual</span>
			) : rounded > 0 ? (
				<span className="font-semibold text-red-700">▲ {percentFormat.format(change)} más</span>
			) : (
				<span className="font-semibold text-emerald-700">▼ {percentFormat.format(-change)} menos</span>
			)}{" "}
			que {period} ({cop(previous)})
		</p>
	);
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
	return (
		<Card>
			<p className="text-sm text-slate-500">{label}</p>
			<p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
			{detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
		</Card>
	);
}

export function SummaryPage() {
	const [params, setParams] = useSearchParams();
	const month = params.get("month") ?? currentMonth();
	const { from, to } = monthRange(month);
	const { categories } = useCatalog();
	const summary = useApiData<SummaryStats>(`/api/stats/summary?month=${month}`);
	const byCategory = useApiData<CategorySpend[]>(`/api/stats/by-category?from=${from}&to=${to}`);

	const selectMonth = (next: string) => setParams(next === currentMonth() ? {} : { month: next }, { replace: true });
	const data = summary.data;
	const isCurrentMonth = month === currentMonth();

	const budgets = categories
		.filter((category) => category.kind === "expense" && (category.monthly_budget ?? 0) > 0)
		.map((category) => ({
			category,
			spent: byCategory.data?.find((row) => row.category_id === category.id)?.amount_minor ?? 0,
			budget: category.monthly_budget! * 100,
		}))
		.sort((a, b) => b.spent / b.budget - a.spent / a.budget);

	return (
		<>
			<h1 className="sr-only">Inicio</h1>
			<MonthSelector month={month} onChange={selectMonth} />
			<ErrorMessage>{summary.error ?? byCategory.error}</ErrorMessage>

			{summary.loading ? (
				<Loading />
			) : (
				data && (
					<div className={`mt-3 space-y-4 transition-opacity ${summary.stale || byCategory.stale ? "opacity-60" : ""}`}>
						<Card>
							<p className="text-sm text-slate-500">{isCurrentMonth ? "Gastado este mes" : `Gastado en ${monthName(month)}`}</p>
							<p className="mt-1 text-5xl font-bold tracking-tight text-slate-900">{cop(data.expense_minor)}</p>
							{data.usd_expense_minor > 0 && (
								<p className="mt-1 text-sm text-slate-600">
									+ {formatMoney({ amountMinor: data.usd_expense_minor, currency: "USD" })} en compras en dólares (no
									incluidas)
								</p>
							)}
							<Comparison summary={data} />
						</Card>

						<div className="grid grid-cols-2 gap-3">
							<StatTile
								label="Promedio diario"
								value={data.days_elapsed > 0 ? cop(data.daily_average_minor) : "—"}
								detail={data.days_elapsed > 0 ? `en ${data.days_elapsed} días` : undefined}
							/>
							{data.projection_minor !== null ? (
								<StatTile label="Proyección del mes" value={cop(data.projection_minor)} detail="si sigues a este ritmo" />
							) : (
								<StatTile label={`Total de ${monthName(data.previous_month)}`} value={cop(data.previous_total_minor)} />
							)}
						</div>

						{data.review_count > 0 ? (
							<Link
								to="/movimientos?month=todos&status=review"
								className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 active:bg-amber-100"
							>
								<span className="text-xl" aria-hidden="true">
									⚠
								</span>
								<div className="flex-1">
									<p className="font-semibold text-amber-900">
										{data.review_count} {data.review_count === 1 ? "movimiento" : "movimientos"} por revisar
									</p>
									<p className="text-sm text-amber-800">Sin categoría o llegaron incompletos</p>
								</div>
								<span className="text-xl text-amber-700">›</span>
							</Link>
						) : (
							<p className="px-1 text-sm text-slate-500">✓ Nada por revisar</p>
						)}

						<Card>
							<div className="mb-3 flex items-baseline justify-between">
								<h2 className="font-semibold text-slate-900">Presupuesto del mes</h2>
								<Link to={`/analisis${params.get("month") ? `?month=${month}` : ""}`} className="text-sm font-medium text-emerald-700">
									Ver análisis ›
								</Link>
							</div>
							{budgets.length === 0 ? (
								<p className="text-sm text-slate-600">
									Todavía no tienes presupuestos.{" "}
									<Link to="/ajustes/categorias" className="font-medium text-emerald-700">
										Defínelos en Ajustes → Categorías
									</Link>
									.
								</p>
							) : (
								<div className="space-y-4">
									{budgets.map((b) => (
										<BudgetMeter key={b.category.id} name={b.category.name} spentMinor={b.spent} budgetMinor={b.budget} />
									))}
								</div>
							)}
						</Card>
					</div>
				)
			)}
		</>
	);
}
