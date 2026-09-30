import { useNavigate } from "react-router";
import type { Transaction } from "../../shared/api";
import { apiFetch } from "../api";
import { useCatalog } from "../catalog";
import { TransactionForm, type TransactionFormValues } from "../components/TransactionForm";
import { Loading, PageHeader } from "../components/ui";
import { toDateTimeInput } from "../format";

const LAST_ACCOUNT_KEY = "lastAccountId";

function readLastAccount(): number | null {
	try {
		const value = Number(localStorage.getItem(LAST_ACCOUNT_KEY));
		return value > 0 ? value : null;
	} catch {
		return null;
	}
}

function saveLastAccount(accountId: number | null) {
	try {
		if (accountId === null) localStorage.removeItem(LAST_ACCOUNT_KEY);
		else localStorage.setItem(LAST_ACCOUNT_KEY, String(accountId));
	} catch {
		// Sin almacenamiento local: solo se pierde la comodidad de recordar la cuenta.
	}
}

export function NewTransactionPage() {
	const navigate = useNavigate();
	const { accounts, loading } = useCatalog();

	if (loading) return <Loading />;

	const lastAccount = readLastAccount();
	const initial: TransactionFormValues = {
		amount: "",
		currency: "COP",
		type: "expense",
		category_id: null,
		account_id: accounts.some((a) => a.id === lastAccount && a.active) ? lastAccount : null,
		merchant: "",
		occurred_at: toDateTimeInput(new Date()),
		note: "",
	};

	async function handleSubmit(values: TransactionFormValues) {
		await apiFetch<Transaction>("/api/transactions", {
			method: "POST",
			body: {
				amount: values.amount,
				currency: values.currency,
				type: values.type,
				category_id: values.category_id,
				account_id: values.account_id,
				merchant: values.merchant,
				occurred_at: values.occurred_at,
				note: values.note,
			},
		});
		saveLastAccount(values.account_id);
		navigate("/movimientos");
	}

	return (
		<>
			<PageHeader title="Nuevo movimiento" />
			<TransactionForm initial={initial} submitLabel="Guardar" onSubmit={handleSubmit} autoFocusAmount />
		</>
	);
}
