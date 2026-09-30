import { useState, type FormEvent, type ReactNode } from "react";
import { TRANSACTION_TYPES, type TransactionType } from "../../shared/api";
import { TRANSACTION_TYPE_LABELS } from "../../shared/labels";
import { parseAmount, type Currency } from "../../shared/money";
import { errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { formatMoney } from "../format";
import { Button, ErrorMessage, Field, inputClass } from "./ui";

export interface TransactionFormValues {
	amount: string;
	currency: Currency;
	type: TransactionType;
	category_id: number | null;
	account_id: number | null;
	merchant: string;
	occurred_at: string; // "YYYY-MM-DDTHH:mm" en hora de Bogotá
	note: string;
}

interface Props {
	initial: TransactionFormValues;
	submitLabel: string;
	onSubmit: (values: TransactionFormValues) => Promise<void>;
	/** Contenido extra antes del botón de guardar; recibe los valores actuales. */
	extra?: (values: TransactionFormValues) => ReactNode;
	/** Poner el cursor en el monto al abrir (solo al crear). */
	autoFocusAmount?: boolean;
}

export function TransactionForm({ initial, submitLabel, onSubmit, extra, autoFocusAmount = false }: Props) {
	const { categories, accounts } = useCatalog();
	const [values, setValues] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const parsed = parseAmount(values.amount, values.currency);
	const typeCategories = categories.filter((c) => c.kind === values.type);
	const accountOptions = accounts.filter((a) => a.active || a.id === initial.account_id);

	function update(changes: Partial<TransactionFormValues>) {
		setValues((current) => ({ ...current, ...changes }));
	}

	function changeType(type: TransactionType) {
		const category = categories.find((c) => c.id === values.category_id);
		update({ type, category_id: category?.kind === type ? values.category_id : null });
	}

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!parsed) {
			setError("Escribe un monto válido, por ejemplo 25.000");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await onSubmit(values);
		} catch (err) {
			setError(errorMessage(err));
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-5">
			<div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
				<div className="flex items-center gap-2">
					<span className="text-3xl font-bold text-slate-400">$</span>
					<input
						aria-label="Monto"
						inputMode="decimal"
						autoComplete="off"
						autoFocus={autoFocusAmount}
						placeholder="0"
						value={values.amount}
						onChange={(event) => update({ amount: event.target.value })}
						className="min-w-0 flex-1 bg-transparent text-4xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
					/>
					<button
						type="button"
						onClick={() => update({ currency: values.currency === "COP" ? "USD" : "COP" })}
						className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
						aria-label="Cambiar moneda"
					>
						{values.currency}
					</button>
				</div>
				<p className="mt-1 h-5 text-sm text-slate-500">
					{parsed ? formatMoney(parsed) : values.amount ? "Monto no válido" : ""}
				</p>
			</div>

			<div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1" role="radiogroup" aria-label="Tipo">
				{TRANSACTION_TYPES.map((type) => (
					<button
						key={type}
						type="button"
						role="radio"
						aria-checked={values.type === type}
						onClick={() => changeType(type)}
						className={`rounded-lg py-2 text-sm font-semibold ${
							values.type === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
						}`}
					>
						{TRANSACTION_TYPE_LABELS[type]}
					</button>
				))}
			</div>

			<fieldset>
				<legend className="mb-2 text-sm font-medium text-slate-600">Categoría</legend>
				<div className="flex flex-wrap gap-2">
					{typeCategories.map((category) => {
						const selected = values.category_id === category.id;
						return (
							<button
								key={category.id}
								type="button"
								aria-pressed={selected}
								onClick={() => update({ category_id: selected ? null : category.id })}
								className={`rounded-full px-3 py-2 text-sm font-medium ring-1 ${
									selected
										? "bg-emerald-600 text-white ring-emerald-600"
										: "bg-white text-slate-700 ring-slate-300"
								}`}
							>
								{category.name}
							</button>
						);
					})}
				</div>
				{values.category_id === null && (
					<p className="mt-2 text-sm text-amber-700">Sin categoría, el movimiento queda "Por revisar".</p>
				)}
			</fieldset>

			<Field label="Cuenta">
				<select
					value={values.account_id ?? ""}
					onChange={(event) => update({ account_id: event.target.value ? Number(event.target.value) : null })}
					className={inputClass}
				>
					<option value="">Sin cuenta</option>
					{accountOptions.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
			</Field>

			<Field label="Comercio o descripción">
				<input
					value={values.merchant}
					onChange={(event) => update({ merchant: event.target.value })}
					placeholder="Ej. Éxito, arriendo, almuerzo"
					maxLength={200}
					className={inputClass}
				/>
			</Field>

			<Field label="Fecha y hora">
				<input
					type="datetime-local"
					required
					value={values.occurred_at}
					onChange={(event) => update({ occurred_at: event.target.value })}
					className={inputClass}
				/>
			</Field>

			<Field label="Nota">
				<textarea
					value={values.note}
					onChange={(event) => update({ note: event.target.value })}
					rows={2}
					maxLength={1000}
					className={inputClass}
				/>
			</Field>

			{extra?.(values)}

			<ErrorMessage>{error}</ErrorMessage>

			{/* Siempre visible encima de la barra inferior, para guardar sin bajar hasta el final. */}
			<div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10">
				<Button type="submit" disabled={saving} className="w-full shadow-lg">
					{saving ? "Guardando…" : submitLabel}
				</Button>
			</div>
		</form>
	);
}
