import { useState, type FormEvent } from "react";
import { TRANSACTION_TYPES, type Category, type TransactionType } from "../../shared/api";
import { TRANSACTION_TYPE_LABELS } from "../../shared/labels";
import { parseAmount } from "../../shared/money";
import { apiFetch, errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { Button, ErrorMessage, Field, inputClass, Loading, PageHeader, Sheet } from "../components/ui";
import { amountToInput, formatMoney } from "../format";

const SECTION_TITLES: Record<TransactionType, string> = {
	expense: "Gastos",
	income: "Ingresos",
	internal: "Internos (no cuentan como gasto)",
};

type Editing = Category | "new" | null;

export function CategoriesPage() {
	const { categories, loading } = useCatalog();
	const [editing, setEditing] = useState<Editing>(null);

	if (loading) return <Loading />;

	return (
		<>
			<PageHeader
				title="Categorías"
				back="/ajustes"
				action={
					<Button className="py-2 text-sm" onClick={() => setEditing("new")}>
						+ Nueva
					</Button>
				}
			/>
			<div className="space-y-5">
				{TRANSACTION_TYPES.map((kind) => (
					<section key={kind}>
						<h2 className="mb-1 px-1 text-sm font-semibold text-slate-500">{SECTION_TITLES[kind]}</h2>
						<ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
							{categories
								.filter((category) => category.kind === kind)
								.map((category) => (
									<li key={category.id}>
										<button
											type="button"
											onClick={() => setEditing(category)}
											className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
										>
											<span className="flex-1 font-medium text-slate-900">{category.name}</span>
											{category.monthly_budget !== null && (
												<span className="text-sm text-slate-500">
													{formatMoney({ amountMinor: category.monthly_budget * 100, currency: "COP" })}/mes
												</span>
											)}
										</button>
									</li>
								))}
						</ul>
					</section>
				))}
			</div>
			{editing && <CategorySheet category={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
		</>
	);
}

function CategorySheet({ category, onClose }: { category: Category | null; onClose: () => void }) {
	const { reload } = useCatalog();
	const [name, setName] = useState(category?.name ?? "");
	const [kind, setKind] = useState<TransactionType>(category?.kind ?? "expense");
	const [budget, setBudget] = useState(
		category?.monthly_budget != null ? amountToInput(category.monthly_budget * 100, "COP") : "",
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function run(action: () => Promise<unknown>) {
		setSaving(true);
		setError(null);
		try {
			await action();
			await reload();
			onClose();
		} catch (err) {
			setError(errorMessage(err));
			setSaving(false);
		}
	}

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const parsedBudget = budget.trim() ? parseAmount(budget, "COP") : null;
		if (budget.trim() && !parsedBudget) {
			setError("Escribe un presupuesto válido, por ejemplo 800.000");
			return;
		}
		const body = { name, kind, monthly_budget: parsedBudget ? Math.round(parsedBudget.amountMinor / 100) : null };
		void run(() =>
			category
				? apiFetch(`/api/categories/${category.id}`, { method: "PATCH", body })
				: apiFetch("/api/categories", { method: "POST", body }),
		);
	}

	function handleDelete() {
		if (!category || !window.confirm(`¿Borrar la categoría "${category.name}"?`)) return;
		void run(() => apiFetch(`/api/categories/${category.id}`, { method: "DELETE" }));
	}

	return (
		<Sheet title={category ? "Editar categoría" : "Nueva categoría"} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<Field label="Nombre">
					<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
				</Field>
				<Field label="Tipo" hint={category ? "Solo se puede cambiar si la categoría no tiene movimientos." : undefined}>
					<select value={kind} onChange={(e) => setKind(e.target.value as TransactionType)} className={inputClass}>
						{TRANSACTION_TYPES.map((type) => (
							<option key={type} value={type}>
								{TRANSACTION_TYPE_LABELS[type]}
							</option>
						))}
					</select>
				</Field>
				{kind === "expense" && (
					<Field label="Presupuesto mensual (opcional)">
						<input
							inputMode="numeric"
							placeholder="Ej. 800.000"
							value={budget}
							onChange={(e) => setBudget(e.target.value)}
							className={inputClass}
						/>
					</Field>
				)}
				<ErrorMessage>{error}</ErrorMessage>
				<Button type="submit" className="w-full" disabled={saving}>
					Guardar
				</Button>
				{category && (
					<Button variant="danger" className="w-full" onClick={handleDelete} disabled={saving}>
						Borrar categoría
					</Button>
				)}
			</form>
		</Sheet>
	);
}
