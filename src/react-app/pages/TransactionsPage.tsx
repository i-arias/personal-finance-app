import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
	TRANSACTION_STATUSES,
	TRANSACTION_TYPES,
	type Transaction,
	type TransactionPage,
	type TransactionTotal,
} from "../../shared/api";
import { STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "../../shared/labels";
import { apiFetch, errorMessage } from "../api";
import { useCatalog } from "../catalog";
import { Button, Card, ErrorMessage, Field, inputClass, Loading, PageHeader, Sheet } from "../components/ui";
import { MonthSelector } from "../components/MonthSelector";
import { currentMonth, dayLabel, formatMoney, monthRange } from "../format";

const FILTER_KEYS = ["account_id", "category_id", "type", "status", "q"] as const;
const ALL_MONTHS = "todos";

interface LoadedPage {
	query: string;
	items: Transaction[];
	totals: TransactionTotal[];
	nextCursor: string | null;
}

function groupByDay(items: Transaction[]): [string, Transaction[]][] {
	const groups = new Map<string, Transaction[]>();
	for (const item of items) {
		const group = groups.get(item.local_date) ?? [];
		group.push(item);
		groups.set(item.local_date, group);
	}
	return [...groups];
}

export function TransactionsPage() {
	const [params, setParams] = useSearchParams();
	// month=todos quita el filtro de fecha; lo usa el enlace "Por revisar" del Inicio.
	const allMonths = params.get("month") === ALL_MONTHS;
	const month = allMonths ? currentMonth() : (params.get("month") ?? currentMonth());
	const query = new URLSearchParams(allMonths ? {} : monthRange(month));
	for (const key of FILTER_KEYS) {
		const value = params.get(key);
		if (value) query.set(key, value);
	}
	const queryString = query.toString();

	// Cada resultado recuerda para qué filtros se pidió; si los filtros cambian, se muestra "Cargando…".
	const [result, setResult] = useState<LoadedPage | null>(null);
	const [error, setError] = useState<{ query: string; message: string } | null>(null);
	const [showFilters, setShowFilters] = useState(false);

	useEffect(() => {
		let cancelled = false;
		apiFetch<TransactionPage>(`/api/transactions?${queryString}`)
			.then((page) => {
				if (cancelled) return;
				setResult({
					query: queryString,
					items: page.items,
					totals: page.totals ?? [],
					nextCursor: page.next_cursor,
				});
				setError(null);
			})
			.catch((err) => !cancelled && setError({ query: queryString, message: errorMessage(err) }));
		return () => {
			cancelled = true;
		};
	}, [queryString]);

	const current = result?.query === queryString ? result : null;
	const currentError = error?.query === queryString ? error.message : null;
	const loading = !current && !currentError;
	const items = current?.items ?? [];
	const nextCursor = current?.nextCursor ?? null;

	async function loadMore() {
		if (!current?.nextCursor) return;
		try {
			const page = await apiFetch<TransactionPage>(
				`/api/transactions?${queryString}&cursor=${encodeURIComponent(current.nextCursor)}`,
			);
			setResult({ ...current, items: [...current.items, ...page.items], nextCursor: page.next_cursor });
		} catch (err) {
			setError({ query: queryString, message: errorMessage(err) });
		}
	}

	function setParam(key: string, value: string | null) {
		setParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (value) next.set(key, value);
				else next.delete(key);
				return next;
			},
			{ replace: true },
		);
	}

	const activeFilters = FILTER_KEYS.filter((key) => params.get(key));
	const reviewOnly = params.get("status") === "review";

	return (
		<>
			<PageHeader
				title="Movimientos"
				action={
					<button
						type="button"
						onClick={() => setShowFilters(true)}
						className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300"
					>
						Filtros{activeFilters.length > 0 && ` (${activeFilters.length})`}
					</button>
				}
			/>

			<div className="mb-3">
				{allMonths ? (
					<div className="flex items-center justify-between py-1.5">
						<span className="font-semibold text-slate-800">Todos los meses</span>
						<button
							type="button"
							onClick={() => setParam("month", null)}
							className="text-sm font-medium text-emerald-700"
						>
							Ver por mes
						</button>
					</div>
				) : (
					<MonthSelector month={month} onChange={(next) => setParam("month", next === currentMonth() ? null : next)} />
				)}
			</div>

			<Totals totals={current?.totals ?? []} />

			<div className="my-4 flex gap-2">
				<button
					type="button"
					onClick={() => setParam("status", reviewOnly ? null : "review")}
					aria-pressed={reviewOnly}
					className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
						reviewOnly ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-700 ring-slate-300"
					}`}
				>
					Por revisar
				</button>
				{activeFilters.length > 0 && (
					<button
						type="button"
						onClick={() => {
							const monthParam = params.get("month");
							setParams(monthParam ? { month: monthParam } : {}, { replace: true });
						}}
						className="rounded-full px-3 py-1.5 text-sm font-medium text-emerald-700"
					>
						Quitar filtros
					</button>
				)}
			</div>

			<ErrorMessage>{currentError}</ErrorMessage>

			{loading ? (
				<Loading />
			) : items.length === 0 ? (
				<p className="py-10 text-center text-slate-500">No hay movimientos con estos filtros.</p>
			) : (
				<div className="space-y-4">
					{groupByDay(items).map(([day, dayItems]) => (
						<section key={day}>
							<h2 className="mb-1 px-1 text-sm font-semibold text-slate-500">{dayLabel(day)}</h2>
							<ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
								{dayItems.map((item) => (
									<TransactionRow key={item.id} transaction={item} />
								))}
							</ul>
						</section>
					))}
					{nextCursor && (
						<Button variant="secondary" className="w-full" onClick={loadMore}>
							Cargar más
						</Button>
					)}
				</div>
			)}

			{showFilters && <FiltersSheet params={params} setParam={setParam} onClose={() => setShowFilters(false)} />}
		</>
	);
}

function Totals({ totals }: { totals: TransactionTotal[] }) {
	const find = (type: TransactionTotal["type"], currency: TransactionTotal["currency"]) =>
		totals.find((t) => t.type === type && t.currency === currency)?.amount_minor ?? 0;
	const usdExpense = find("expense", "USD");

	return (
		<Card className="grid grid-cols-2 gap-4">
			<div>
				<p className="text-sm text-slate-500">Gastos</p>
				<p className="text-2xl font-bold text-slate-900">{formatMoney({ amountMinor: find("expense", "COP"), currency: "COP" })}</p>
				{usdExpense > 0 && (
					<p className="text-sm text-slate-600">+ {formatMoney({ amountMinor: usdExpense, currency: "USD" })}</p>
				)}
			</div>
			<div>
				<p className="text-sm text-slate-500">Ingresos</p>
				<p className="text-2xl font-bold text-emerald-700">
					{formatMoney({ amountMinor: find("income", "COP"), currency: "COP" })}
				</p>
			</div>
		</Card>
	);
}

function TransactionRow({ transaction: t }: { transaction: Transaction }) {
	const { categoryById, accountById } = useCatalog();
	const category = t.category_id ? categoryById.get(t.category_id) : undefined;
	const account = t.account_id ? accountById.get(t.account_id) : undefined;
	const amount = formatMoney({ amountMinor: t.amount_minor, currency: t.currency });
	const amountStyle =
		t.type === "income" ? "text-emerald-700" : t.type === "internal" ? "text-slate-400" : "text-slate-900";

	return (
		<li>
			<Link to={`/movimientos/${t.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-slate-900">{t.merchant ?? category?.name ?? "Sin descripción"}</p>
					<p className="truncate text-sm text-slate-500">
						{[category?.name ?? "Sin categoría", account?.name].filter(Boolean).join(" · ")}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<p className={`font-semibold tabular-nums ${amountStyle}`}>
						{t.type === "income" ? "+" : ""}
						{amount}
					</p>
					{t.status === "review" && <p className="text-xs font-semibold text-amber-700">Por revisar</p>}
				</div>
			</Link>
		</li>
	);
}

function FiltersSheet({
	params,
	setParam,
	onClose,
}: {
	params: URLSearchParams;
	setParam: (key: string, value: string | null) => void;
	onClose: () => void;
}) {
	const { categories, accounts } = useCatalog();
	const [q, setQ] = useState(params.get("q") ?? "");

	return (
		<Sheet title="Filtros" onClose={onClose}>
			<div className="space-y-4">
				<Field label="Buscar">
					<input
						type="search"
						value={q}
						onChange={(event) => setQ(event.target.value)}
						onBlur={() => setParam("q", q.trim() || null)}
						placeholder="Comercio o nota"
						className={inputClass}
					/>
				</Field>
				<Field label="Cuenta">
					<select
						value={params.get("account_id") ?? ""}
						onChange={(event) => setParam("account_id", event.target.value || null)}
						className={inputClass}
					>
						<option value="">Todas</option>
						{accounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Categoría">
					<select
						value={params.get("category_id") ?? ""}
						onChange={(event) => setParam("category_id", event.target.value || null)}
						className={inputClass}
					>
						<option value="">Todas</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Tipo">
					<select
						value={params.get("type") ?? ""}
						onChange={(event) => setParam("type", event.target.value || null)}
						className={inputClass}
					>
						<option value="">Todos</option>
						{TRANSACTION_TYPES.map((type) => (
							<option key={type} value={type}>
								{TRANSACTION_TYPE_LABELS[type]}
							</option>
						))}
					</select>
				</Field>
				<Field label="Estado">
					<select
						value={params.get("status") ?? ""}
						onChange={(event) => setParam("status", event.target.value || null)}
						className={inputClass}
					>
						<option value="">Todos</option>
						{TRANSACTION_STATUSES.map((status) => (
							<option key={status} value={status}>
								{STATUS_LABELS[status]}
							</option>
						))}
					</select>
				</Field>
				<Button
					className="w-full"
					onClick={() => {
						setParam("q", q.trim() || null);
						onClose();
					}}
				>
					Ver resultados
				</Button>
			</div>
		</Sheet>
	);
}
