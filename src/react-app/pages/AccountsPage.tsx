import { useState, type FormEvent } from "react";
import { ACCOUNT_TYPES, type Account, type AccountType } from "../../shared/api";
import { ACCOUNT_TYPE_LABELS } from "../../shared/labels";
import { apiFetch, errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { Button, ErrorMessage, Field, inputClass, Loading, PageHeader, Sheet } from "../components/ui";

type Editing = Account | "new" | null;

export function AccountsPage() {
	const { accounts, loading } = useCatalog();
	const [editing, setEditing] = useState<Editing>(null);

	if (loading) return <Loading />;

	return (
		<>
			<PageHeader
				title="Cuentas y tarjetas"
				back="/ajustes"
				action={
					<Button className="py-2 text-sm" onClick={() => setEditing("new")}>
						+ Nueva
					</Button>
				}
			/>
			{accounts.length === 0 ? (
				<p className="py-10 text-center text-slate-500">Todavía no hay cuentas.</p>
			) : (
				<ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
					{accounts.map((account) => (
						<li key={account.id}>
							<button
								type="button"
								onClick={() => setEditing(account)}
								className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 ${
									account.active ? "" : "opacity-50"
								}`}
							>
								<div className="flex-1">
									<p className="font-medium text-slate-900">
										{account.name}
										{!account.active && <span className="ml-2 text-xs text-slate-500">(inactiva)</span>}
									</p>
									<p className="text-sm text-slate-500">
										{[ACCOUNT_TYPE_LABELS[account.type], account.institution].filter(Boolean).join(" · ")}
									</p>
									{account.wallet_card_name && (
										<p className="text-sm text-slate-500">Wallet: {account.wallet_card_name}</p>
									)}
								</div>
								<span className="text-xl text-slate-400">›</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{editing && <AccountSheet account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
		</>
	);
}

function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
	const { reload } = useCatalog();
	const [name, setName] = useState(account?.name ?? "");
	const [institution, setInstitution] = useState(account?.institution ?? "");
	const [type, setType] = useState<AccountType>(account?.type ?? "credit_card");
	const [walletName, setWalletName] = useState(account?.wallet_card_name ?? "");
	const [active, setActive] = useState(account?.active ?? true);
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
		const body = { name, institution, type, wallet_card_name: walletName, active };
		void run(() =>
			account
				? apiFetch(`/api/accounts/${account.id}`, { method: "PATCH", body })
				: apiFetch("/api/accounts", { method: "POST", body }),
		);
	}

	function handleDelete() {
		if (!account || !window.confirm(`¿Borrar la cuenta "${account.name}"?`)) return;
		void run(() => apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" }));
	}

	return (
		<Sheet title={account ? "Editar cuenta" : "Nueva cuenta"} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<Field label="Nombre">
					<input
						required
						maxLength={60}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Ej. Ahorros Bancolombia"
						className={inputClass}
					/>
				</Field>
				<Field label="Banco o entidad">
					<input maxLength={60} value={institution} onChange={(e) => setInstitution(e.target.value)} className={inputClass} />
				</Field>
				<Field label="Tipo">
					<select value={type} onChange={(e) => setType(e.target.value as AccountType)} className={inputClass}>
						{ACCOUNT_TYPES.map((accountType) => (
							<option key={accountType} value={accountType}>
								{ACCOUNT_TYPE_LABELS[accountType]}
							</option>
						))}
					</select>
				</Field>
				<Field
					label="Nombre en Apple Wallet (opcional)"
					hint="Tal como aparece en Wallet. Nunca pongas números de tarjeta."
				>
					<input
						maxLength={100}
						value={walletName}
						onChange={(e) => setWalletName(e.target.value)}
						className={inputClass}
					/>
				</Field>
				<label className="flex items-center gap-3 text-base text-slate-800">
					<input
						type="checkbox"
						checked={active}
						onChange={(e) => setActive(e.target.checked)}
						className="size-5 accent-emerald-600"
					/>
					Activa (aparece al registrar movimientos)
				</label>
				<ErrorMessage>{error}</ErrorMessage>
				<Button type="submit" className="w-full" disabled={saving}>
					Guardar
				</Button>
				{account && (
					<Button variant="danger" className="w-full" onClick={handleDelete} disabled={saving}>
						Borrar cuenta
					</Button>
				)}
			</form>
		</Sheet>
	);
}
