import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Category } from "../shared/api";
import { apiFetch, errorMessage } from "./api";

interface Catalog {
	categories: Category[];
	accounts: Account[];
	loading: boolean;
	error: string | null;
	reload: () => Promise<void>;
	categoryById: Map<number, Category>;
	accountById: Map<number, Account>;
}

const CatalogContext = createContext<Catalog | null>(null);

/** Categorías y cuentas: se cargan una vez y las usan todas las pantallas. */
export function CatalogProvider({ children }: { children: ReactNode }) {
	const [categories, setCategories] = useState<Category[]>([]);
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			const [nextCategories, nextAccounts] = await Promise.all([
				apiFetch<Category[]>("/api/categories"),
				apiFetch<Account[]>("/api/accounts"),
			]);
			setCategories(nextCategories);
			setAccounts(nextAccounts);
			setError(null);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const value = useMemo<Catalog>(
		() => ({
			categories,
			accounts,
			loading,
			error,
			reload,
			categoryById: new Map(categories.map((c) => [c.id, c])),
			accountById: new Map(accounts.map((a) => [a.id, a])),
		}),
		[categories, accounts, loading, error, reload],
	);

	return <CatalogContext value={value}>{children}</CatalogContext>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog(): Catalog {
	const catalog = useContext(CatalogContext);
	if (!catalog) throw new Error("useCatalog debe usarse dentro de CatalogProvider");
	return catalog;
}
