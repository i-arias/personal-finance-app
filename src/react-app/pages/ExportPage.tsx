import { useState } from "react";
import { Card, Field, inputClass, PageHeader } from "../components/ui";
import { currentMonth, monthRange } from "../format";

export function ExportPage() {
	const initial = monthRange(currentMonth());
	const [from, setFrom] = useState(initial.from);
	const [to, setTo] = useState(initial.to);
	const valid = Boolean(from && to && from <= to);
	const href = `/api/export.csv?${new URLSearchParams({ from, to })}`;

	return (
		<>
			<PageHeader title="Exportar a CSV" back="/ajustes" />
			<Card className="space-y-4">
				<p className="text-sm text-slate-600">
					Descarga los movimientos del rango en un archivo que se abre directamente en Excel.
				</p>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Desde">
						<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
					</Field>
					<Field label="Hasta">
						<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
					</Field>
				</div>
				{valid ? (
					<a
						href={href}
						download
						className="block rounded-xl bg-emerald-600 px-4 py-3 text-center text-base font-semibold text-white active:bg-emerald-700"
					>
						Descargar CSV
					</a>
				) : (
					<p className="text-sm text-red-700">La fecha inicial debe ser anterior a la final.</p>
				)}
			</Card>
		</>
	);
}
