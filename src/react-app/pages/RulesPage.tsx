import { useEffect, useState, type FormEvent } from "react";
import { TRANSACTION_TYPES, type Rule, type TransactionType } from "../../shared/api";
import { TRANSACTION_TYPE_LABELS } from "../../shared/labels";
import { apiFetch, errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { Button, ErrorMessage, Field, inputClass, Loading, PageHeader, Sheet } from "../components/ui";

type Editing = Rule | "new" | null;

export function RulesPage() {
	const { categoryById } = useCatalog();
	const [rules, setRules] = useState<Rule[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing>(null);
	const [version, setVersion] = useState(0); // se incrementa para volver a cargar

	useEffect(() => {
		let cancelled = false;
		apiFetch<Rule[]>("/api/rules")
			.then((next) => !cancelled && setRules(next))
			.catch((err) => !cancelled && setError(errorMessage(err)));
		return () => {
			cancelled = true;
		};
	}, [version]);

	return (
		<>
			<PageHeader
				title="Reglas"
				back="/ajustes"
				action={
					<Button className="py-2 text-sm" onClick={() => setEditing("new")}>
						+ Nueva
					</Button>
				}
			/>
			<p className="mb-4 text-sm text-slate-600">
				Cuando llega un movimiento automático cuyo comercio contiene el texto de una regla, se le asignan el nombre,
				la categoría y el tipo de la regla. Si varias coinciden, gana la de menor prioridad.
			</p>
			<ErrorMessage>{error}</ErrorMessage>
			{!rules ? (
				<Loading />
			) : rules.length === 0 ? (
				<p className="py-10 text-center text-slate-500">
					Todavía no hay reglas. También puedes crearlas al corregir la categoría de un movimiento.
				</p>
			) : (
				<ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
					{rules.map((rule) => (
						<li key={rule.id}>
							<button
								type="button"
								onClick={() => setEditing(rule)}
								className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-slate-900">"{rule.pattern}"</p>
									<p className="truncate text-sm text-slate-500">
										→{" "}
										{[
											rule.merchant_name,
											rule.category_id ? categoryById.get(rule.category_id)?.name : null,
											rule.type ? TRANSACTION_TYPE_LABELS[rule.type] : null,
										]
											.filter(Boolean)
											.join(" · ") || "sin cambios"}
									</p>
								</div>
								<span className="text-sm text-slate-400">#{rule.priority}</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{editing && (
				<RuleSheet
					rule={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						setVersion((v) => v + 1);
					}}
				/>
			)}
		</>
	);
}

function RuleSheet({ rule, onClose, onSaved }: { rule: Rule | null; onClose: () => void; onSaved: () => void }) {
	const { categories } = useCatalog();
	const [pattern, setPattern] = useState(rule?.pattern ?? "");
	const [merchantName, setMerchantName] = useState(rule?.merchant_name ?? "");
	const [type, setType] = useState<TransactionType | "">(rule?.type ?? "");
	const [categoryId, setCategoryId] = useState<number | null>(rule?.category_id ?? null);
	const [priority, setPriority] = useState(String(rule?.priority ?? 100));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const categoryOptions = type ? categories.filter((c) => c.kind === type) : categories;

	async function run(action: () => Promise<unknown>) {
		setSaving(true);
		setError(null);
		try {
			await action();
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
			setSaving(false);
		}
	}

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const body = {
			pattern,
			merchant_name: merchantName,
			type: type || null,
			category_id: categoryId,
			priority: Number(priority) || 0,
		};
		void run(() =>
			rule
				? apiFetch(`/api/rules/${rule.id}`, { method: "PATCH", body })
				: apiFetch("/api/rules", { method: "POST", body }),
		);
	}

	function handleDelete() {
		if (!rule || !window.confirm(`¿Borrar la regla "${rule.pattern}"?`)) return;
		void run(() => apiFetch(`/api/rules/${rule.id}`, { method: "DELETE" }));
	}

	function changeType(next: TransactionType | "") {
		setType(next);
		const category = categories.find((c) => c.id === categoryId);
		if (next && category && category.kind !== next) setCategoryId(null);
	}

	return (
		<Sheet title={rule ? "Editar regla" : "Nueva regla"} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<Field label="Si el comercio contiene" hint="Sin distinguir mayúsculas ni tildes. Ej. RAPPI">
					<input required maxLength={100} value={pattern} onChange={(e) => setPattern(e.target.value)} className={inputClass} />
				</Field>
				<Field label="Nombre limpio (opcional)">
					<input
						maxLength={200}
						value={merchantName}
						onChange={(e) => setMerchantName(e.target.value)}
						placeholder="Ej. Rappi"
						className={inputClass}
					/>
				</Field>
				<Field label="Tipo">
					<select value={type} onChange={(e) => changeType(e.target.value as TransactionType | "")} className={inputClass}>
						<option value="">No cambiar</option>
						{TRANSACTION_TYPES.map((t) => (
							<option key={t} value={t}>
								{TRANSACTION_TYPE_LABELS[t]}
							</option>
						))}
					</select>
				</Field>
				<Field label="Categoría">
					<select
						value={categoryId ?? ""}
						onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
						className={inputClass}
					>
						<option value="">No cambiar</option>
						{categoryOptions.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Prioridad" hint="Si varias reglas coinciden, gana el número menor.">
					<input
						inputMode="numeric"
						value={priority}
						onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))}
						className={inputClass}
					/>
				</Field>
				<ErrorMessage>{error}</ErrorMessage>
				<Button type="submit" className="w-full" disabled={saving}>
					Guardar
				</Button>
				{rule && (
					<Button variant="danger" className="w-full" onClick={handleDelete} disabled={saving}>
						Borrar regla
					</Button>
				)}
			</form>
		</Sheet>
	);
}
