import { formatMoney } from "../format";

type BudgetState = "ok" | "near" | "over";

// Relleno y pista del mismo tono; amarillo y rojo son colores de estado y siempre van con ícono + texto.
const STYLES: Record<BudgetState, { fill: string; track: string }> = {
	ok: { fill: "bg-emerald-600", track: "bg-emerald-100" },
	near: { fill: "bg-[#fab219]", track: "bg-amber-100" },
	over: { fill: "bg-[#d03b3b]", track: "bg-red-100" },
};

const percentFormat = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

function budgetState(spentMinor: number, budgetMinor: number): BudgetState {
	const ratio = spentMinor / budgetMinor;
	return ratio > 1 ? "over" : ratio >= 0.9 ? "near" : "ok";
}

export function BudgetMeter({ name, spentMinor, budgetMinor }: { name: string; spentMinor: number; budgetMinor: number }) {
	const state = budgetState(spentMinor, budgetMinor);
	const ratio = spentMinor / budgetMinor;
	const cop = (amountMinor: number) => formatMoney({ amountMinor, currency: "COP" });

	return (
		<div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="truncate text-sm font-medium text-slate-800">{name}</span>
				<span className="shrink-0 text-sm tabular-nums text-slate-600">
					<span className="font-semibold text-slate-900">{cop(spentMinor)}</span> de {cop(budgetMinor)}
				</span>
			</div>
			<div
				role="meter"
				aria-label={`Presupuesto de ${name}`}
				aria-valuemin={0}
				aria-valuemax={budgetMinor}
				aria-valuenow={spentMinor}
				className={`mt-1 h-3 overflow-hidden rounded ${STYLES[state].track}`}
			>
				<div className={`h-full rounded-r ${STYLES[state].fill}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
			</div>
			<p className="mt-1 text-xs text-slate-600">
				{state === "over" && (
					<span className="font-semibold text-red-700">⚠ Excedido por {cop(spentMinor - budgetMinor)}</span>
				)}
				{state === "near" && (
					<span className="font-semibold text-amber-800">⚠ Cerca del límite ({percentFormat.format(ratio)})</span>
				)}
				{state === "ok" && <>Quedan {cop(budgetMinor - spentMinor)}</>}
			</p>
		</div>
	);
}
