import { Link } from "react-router";
import { formatMoney } from "../format";

export interface BarListItem {
	key: string;
	label: string;
	detail?: string;
	amountMinor: number;
	href?: string;
}

const percentFormat = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

/**
 * Barras horizontales ordenadas (una sola serie, un solo color). Cada fila muestra el nombre,
 * el monto y el porcentaje del total, así que ningún valor depende de un tooltip.
 */
export function BarList({ items, total }: { items: BarListItem[]; total: number }) {
	const max = Math.max(0, ...items.map((item) => item.amountMinor));

	return (
		<ul className="space-y-1">
			{items.map((item) => {
				const width = max > 0 ? (item.amountMinor / max) * 100 : 0;
				const row = (
					<>
						<div className="flex items-baseline justify-between gap-3">
							<span className="truncate text-sm font-medium text-slate-800">{item.label}</span>
							<span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
								{formatMoney({ amountMinor: item.amountMinor, currency: "COP" })}
							</span>
						</div>
						<div className="mt-1 flex items-center gap-2">
							<div className="h-3 flex-1">
								{/* Punta redondeada de 4px, base recta. */}
								<div
									className="h-full min-w-0.5 rounded-r bg-emerald-600"
									style={{ width: `${width}%` }}
								/>
							</div>
							<span className="w-10 text-right text-xs tabular-nums text-slate-500">
								{total > 0 ? percentFormat.format(item.amountMinor / total) : ""}
							</span>
						</div>
						{item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
					</>
				);
				return (
					<li key={item.key}>
						{item.href ? (
							<Link to={item.href} className="-mx-2 block rounded-lg px-2 py-1.5 active:bg-slate-50">
								{row}
							</Link>
						) : (
							<div className="py-1.5">{row}</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}
