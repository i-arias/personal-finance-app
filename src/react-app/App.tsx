import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { SESSION_EXPIRED_EVENT } from "./api";
import { useCatalog } from "./catalog";
import { BottomNav } from "./components/BottomNav";
import { Button, ErrorMessage, Loading } from "./components/ui";
import { AccountsPage } from "./pages/AccountsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { EditTransactionPage } from "./pages/EditTransactionPage";
import { ExportPage } from "./pages/ExportPage";
import { NewTransactionPage } from "./pages/NewTransactionPage";
import { RulesPage } from "./pages/RulesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SummaryPage } from "./pages/SummaryPage";
import { TransactionsPage } from "./pages/TransactionsPage";

// Análisis incluye Recharts: se descarga solo cuando se abre esa pestaña.
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));

function App() {
	const { error: catalogError, reload } = useCatalog();
	const [sessionExpired, setSessionExpired] = useState(false);

	useEffect(() => {
		const onExpired = () => setSessionExpired(true);
		window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
		return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
	}, []);

	return (
		<div className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
			{sessionExpired && (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-6">
					<div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
						<p className="text-lg font-bold text-slate-900">Tu sesión expiró</p>
						<p className="mt-2 text-sm text-slate-600">Vuelve a iniciar sesión para seguir usando la app.</p>
						<Button className="mt-5 w-full" onClick={() => window.location.reload()}>
							Volver a iniciar sesión
						</Button>
					</div>
				</div>
			)}

			{catalogError && !sessionExpired && (
				<div className="mb-4 space-y-2">
					<ErrorMessage>No se pudieron cargar las categorías y cuentas: {catalogError}</ErrorMessage>
					<Button variant="secondary" className="w-full" onClick={() => void reload()}>
						Reintentar
					</Button>
				</div>
			)}

			<Suspense fallback={<Loading />}>
				<Routes>
					<Route path="/" element={<SummaryPage />} />
					<Route path="/movimientos" element={<TransactionsPage />} />
					<Route path="/movimientos/:id" element={<EditTransactionPage />} />
					<Route path="/nuevo" element={<NewTransactionPage />} />
					<Route path="/analisis" element={<AnalysisPage />} />
					<Route path="/ajustes" element={<SettingsPage />} />
					<Route path="/ajustes/categorias" element={<CategoriesPage />} />
					<Route path="/ajustes/cuentas" element={<AccountsPage />} />
					<Route path="/ajustes/reglas" element={<RulesPage />} />
					<Route path="/ajustes/exportar" element={<ExportPage />} />
					<Route path="*" element={<SummaryPage />} />
				</Routes>
			</Suspense>

			<BottomNav />
		</div>
	);
}

export default App;
