import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Transaction, TransactionDetail } from "../../shared/api";
import { SOURCE_LABELS } from "../../shared/labels";
import { apiFetch, errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { TransactionForm, type TransactionFormValues } from "../components/TransactionForm";
import { Button, ErrorMessage, Loading, PageHeader } from "../components/ui";
import { amountToInput, toDateTimeInput } from "../format";

export function EditTransactionPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	// Vuelve a la lista con sus filtros; si se abrió este movimiento directamente, va al inicio.
	const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/movimientos"));
	const { categoryById, loading: catalogLoading } = useCatalog();
	const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [createRule, setCreateRule] = useState(true);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		apiFetch<TransactionDetail>(`/api/transactions/${id}`)
			.then(setTransaction)
			.catch((err) => setError(errorMessage(err)));
	}, [id]);

	if (error && !transaction) {
		return (
			<>
				<PageHeader title="Movimiento" back="/movimientos" />
				<ErrorMessage>{error}</ErrorMessage>
			</>
		);
	}
	if (!transaction || catalogLoading) return <Loading />;

	const current = transaction;
	const rulePattern = current.merchant_raw ?? current.merchant;
	const initial: TransactionFormValues = {
		amount: amountToInput(current.amount_minor, current.currency),
		currency: current.currency,
		type: current.type,
		category_id: current.category_id,
		account_id: current.account_id,
		merchant: current.merchant ?? "",
		occurred_at: toDateTimeInput(current.occurred_at),
		note: current.note ?? "",
	};

	/** Se ofrece crear una regla cuando se cambia la categoría de un movimiento con comercio (sección 7.4). */
	function offersRule(values: TransactionFormValues): boolean {
		return Boolean(rulePattern) && values.category_id !== null && values.category_id !== current.category_id;
	}

	async function handleSubmit(values: TransactionFormValues) {
		await apiFetch<Transaction>(`/api/transactions/${current.id}`, {
			method: "PATCH",
			body: {
				amount: values.amount,
				currency: values.currency,
				type: values.type,
				category_id: values.category_id,
				account_id: values.account_id,
				merchant: values.merchant,
				occurred_at: values.occurred_at,
				note: values.note,
				// Guardar desde esta pantalla cuenta como revisado, salvo que siga sin categoría.
				status: values.category_id === null ? "review" : "ok",
			},
		});
		if (createRule && offersRule(values)) {
			await apiFetch("/api/rules", {
				method: "POST",
				body: {
					pattern: rulePattern,
					merchant_name: values.merchant || null,
					category_id: values.category_id,
					type: values.type,
				},
			});
		}
		goBack();
	}

	async function handleDelete() {
		if (!window.confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
		setDeleting(true);
		try {
			await apiFetch(`/api/transactions/${current.id}`, { method: "DELETE" });
			goBack();
		} catch (err) {
			setError(errorMessage(err));
			setDeleting(false);
		}
	}

	return (
		<>
			<PageHeader title="Editar movimiento" back="/movimientos" />
			<p className="mb-4 text-sm text-slate-500">
				Origen: {SOURCE_LABELS[current.source]}
				{current.status === "review" && <span className="ml-2 font-semibold text-amber-700">· Por revisar</span>}
			</p>

			<TransactionForm
				initial={initial}
				submitLabel="Guardar cambios"
				onSubmit={handleSubmit}
				extra={(values) =>
					offersRule(values) && (
						<label className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
							<input
								type="checkbox"
								checked={createRule}
								onChange={(event) => setCreateRule(event.target.checked)}
								className="mt-0.5 size-5 accent-emerald-600"
							/>
							<span>
								Crear regla: cuando el comercio contenga <strong>"{rulePattern}"</strong>, usar{" "}
								<strong>{categoryById.get(values.category_id!)?.name}</strong>.
							</span>
						</label>
					)
				}
			/>

			<div className="mt-6 space-y-3">
				<ErrorMessage>{error}</ErrorMessage>
				<Button variant="danger" className="w-full" onClick={handleDelete} disabled={deleting}>
					{deleting ? "Borrando…" : "Borrar movimiento"}
				</Button>
				{current.raw_payload && (
					<details className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
						<summary className="cursor-pointer font-medium text-slate-700">Datos originales</summary>
						<p className="mt-2 text-xs text-slate-500">Lo que llegó tal cual, útil para ajustar reglas.</p>
						<pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-800">
							{current.raw_payload}
						</pre>
					</details>
				)}
			</div>
		</>
	);
}
