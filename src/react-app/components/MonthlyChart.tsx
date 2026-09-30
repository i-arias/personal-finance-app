import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Category, MonthlyStats } from "../../shared/api";
import { compactMoney, formatMoney, monthLabel, shortMonthLabel } from "../format";

// Paleta categórica de referencia (guía dataviz), en su orden fijo. Validada sobre blanco: pasa
// daltonismo; 3 tonos quedan bajo 3:1 de contraste, por eso siempre hay leyenda y vista de tabla.
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#c3c2b7";
const MAX_SERIES = SERIES_COLORS.length;

const INK_MUTED = "#898781";
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";

interface Series {
	key: string;
	name: string;
	color: string;
}

type Row = { month: string; label: string; total: number } & Record<string, number | string>;

/**
 * Las 5 categorías con más gasto en los 12 meses tienen color propio (del mayor al menor, abajo hacia
 * arriba); el resto, y lo que no tiene categoría, se suma en "Otras". El conjunto solo cambia cuando
 * cambia la ventana de 12 meses, así que una categoría no cambia de color al navegar.
 */
function buildChart(stats: MonthlyStats, categoryById: Map<number, Category>) {
	const totals = new Map<number, number>();
	for (const row of stats.rows) {
		if (row.category_id !== null) {
			totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
		}
	}
	const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, MAX_SERIES).map(([id]) => id);

	const series: Series[] = top.map((id, i) => ({
		key: `c${id}`,
		name: categoryById.get(id)?.name ?? "Categoría",
		color: SERIES_COLORS[i],
	}));
	const hasOther = stats.rows.some((row) => row.category_id === null || !top.includes(row.category_id));
	if (hasOther) series.push({ key: "other", name: "Otras", color: OTHER_COLOR });

	const rows: Row[] = stats.months.map((month) => {
		const row: Row = { month, label: shortMonthLabel(month), total: 0 };
		for (const s of series) row[s.key] = 0;
		return row;
	});
	const rowByMonth = new Map(rows.map((row) => [row.month, row]));
	for (const item of stats.rows) {
		const row = rowByMonth.get(item.month);
		if (!row) continue;
		const key = item.category_id !== null && top.includes(item.category_id) ? `c${item.category_id}` : "other";
		row[key] = (row[key] as number) + item.amount_minor;
		row.total += item.amount_minor;
	}
	return { series, rows };
}

interface MonthTooltipProps {
	active?: boolean;
	payload?: readonly { payload?: unknown }[];
	series: Series[];
}

function MonthTooltip({ active, payload, series }: MonthTooltipProps) {
	const row = payload?.[0]?.payload as Row | undefined;
	if (!active || !row) return null;
	return (
		<div className="min-w-44 rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200">
			<p className="font-semibold text-slate-900">{formatMoney({ amountMinor: row.total, currency: "COP" })}</p>
			<p className="mb-2 text-xs text-slate-500">{monthLabel(row.month)}</p>
			<ul className="space-y-1">
				{[...series].reverse().map((s) =>
					(row[s.key] as number) > 0 ? (
						<li key={s.key} className="flex items-center gap-2">
							<span className="h-0.5 w-3 rounded" style={{ backgroundColor: s.color }} />
							<span className="font-medium tabular-nums text-slate-900">
								{formatMoney({ amountMinor: row[s.key] as number, currency: "COP" })}
							</span>
							<span className="truncate text-slate-500">{s.name}</span>
						</li>
					) : null,
				)}
			</ul>
		</div>
	);
}

interface Props {
	stats: MonthlyStats;
	categoryById: Map<number, Category>;
	onSelectMonth: (month: string) => void;
}

export function MonthlyChart({ stats, categoryById, onSelectMonth }: Props) {
	const [showTable, setShowTable] = useState(false);
	const { series, rows } = buildChart(stats, categoryById);

	if (rows.every((row) => row.total === 0)) {
		return <p className="py-6 text-center text-sm text-slate-500">Todavía no hay gastos en los últimos 12 meses.</p>;
	}

	return (
		<div>
			<div className="h-56">
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
						<CartesianGrid vertical={false} stroke={GRID} />
						<XAxis
							dataKey="label"
							interval={0}
							tickLine={false}
							axisLine={{ stroke: BASELINE }}
							tick={{ fontSize: 11, fill: INK_MUTED }}
						/>
						<YAxis
							width={58}
							tickFormatter={compactMoney}
							tickLine={false}
							axisLine={false}
							tick={{ fontSize: 11, fill: INK_MUTED }}
						/>
						<Tooltip
							content={(props) => <MonthTooltip active={props.active} payload={props.payload} series={series} />}
							cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
						/>
						{series.map((s, i) => (
							<Bar
								key={s.key}
								dataKey={s.key}
								name={s.name}
								stackId="gasto"
								fill={s.color}
								// Borde del color de la superficie = separación de 2px entre segmentos.
								stroke="#ffffff"
								strokeWidth={2}
								maxBarSize={24}
								isAnimationActive={false}
								radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
								onClick={(data) => onSelectMonth((data.payload as Row).month)}
								className="cursor-pointer"
							/>
						))}
					</BarChart>
				</ResponsiveContainer>
			</div>

			<ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
				{series.map((s) => (
					<li key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
						<span className="size-2.5 rounded-[2px]" style={{ backgroundColor: s.color }} />
						{s.name}
					</li>
				))}
			</ul>

			<button
				type="button"
				onClick={() => setShowTable((value) => !value)}
				className="mt-3 text-sm font-medium text-emerald-700"
			>
				{showTable ? "Ocultar tabla" : "Ver tabla"}
			</button>

			{showTable && (
				<div className="mt-2 overflow-x-auto">
					<table className="w-full text-right text-xs tabular-nums">
						<thead className="text-slate-500">
							<tr>
								<th className="sticky left-0 bg-white py-1 pr-3 text-left font-medium">Mes</th>
								<th className="px-2 py-1 font-semibold text-slate-800">Total</th>
								{series.map((s) => (
									<th key={s.key} className="whitespace-nowrap px-2 py-1 font-medium">
										{s.name}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 text-slate-700">
							{[...rows].reverse().map((row) => (
								<tr key={row.month}>
									<td className="sticky left-0 whitespace-nowrap bg-white py-1 pr-3 text-left">{monthLabel(row.month)}</td>
									<td className="px-2 py-1 font-semibold text-slate-900">
										{formatMoney({ amountMinor: row.total, currency: "COP" })}
									</td>
									{series.map((s) => (
										<td key={s.key} className="whitespace-nowrap px-2 py-1">
											{formatMoney({ amountMinor: row[s.key] as number, currency: "COP" })}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
