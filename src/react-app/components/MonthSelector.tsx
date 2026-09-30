import { currentMonth, monthLabel, shiftMonth } from "../format";

/** "‹ Septiembre de 2026 ›". No deja avanzar más allá del mes actual. */
export function MonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
	const isLatest = month >= currentMonth();
	return (
		<div className="flex items-center justify-between">
			<button
				type="button"
				onClick={() => onChange(shiftMonth(month, -1))}
				className="rounded-full px-3 py-1 text-2xl text-emerald-700"
				aria-label="Mes anterior"
			>
				‹
			</button>
			<span className="font-semibold text-slate-800">{monthLabel(month)}</span>
			<button
				type="button"
				onClick={() => onChange(shiftMonth(month, 1))}
				disabled={isLatest}
				className="rounded-full px-3 py-1 text-2xl text-emerald-700 disabled:text-slate-300"
				aria-label="Mes siguiente"
			>
				›
			</button>
		</div>
	);
}
