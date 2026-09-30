import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiFetch, errorMessage } from "../api";
import { Card, PageHeader } from "../components/ui";

type Health = { ok: true; user: string; db: { categories: number; accounts: number } };

const SECTIONS = [
	{ to: "/ajustes/categorias", label: "Categorías", description: "Nombres y presupuesto mensual" },
	{ to: "/ajustes/cuentas", label: "Cuentas y tarjetas", description: "Nombre en Wallet, activar o desactivar" },
	{ to: "/ajustes/reglas", label: "Reglas", description: "Categorización automática por comercio" },
	{ to: "/ajustes/exportar", label: "Exportar a CSV", description: "Descargar movimientos para Excel" },
];

export function SettingsPage() {
	const [health, setHealth] = useState<Health | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		apiFetch<Health>("/api/health")
			.then(setHealth)
			.catch((err) => setError(errorMessage(err)));
	}, []);

	return (
		<>
			<PageHeader title="Ajustes" />
			<ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
				{SECTIONS.map((section) => (
					<li key={section.to}>
						<Link to={section.to} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
							<div className="flex-1">
								<p className="font-medium text-slate-900">{section.label}</p>
								<p className="text-sm text-slate-500">{section.description}</p>
							</div>
							<span className="text-xl text-slate-400">›</span>
						</Link>
					</li>
				))}
			</ul>

			<Card className="mt-6">
				<h2 className="text-sm font-medium text-slate-500">Estado</h2>
				{health ? (
					<>
						<p className="mt-2 font-semibold text-emerald-600">Conectada ✓</p>
						<p className="text-sm text-slate-600">Sesión: {health.user}</p>
						<p className="mt-1 text-sm text-slate-600">
							Base de datos: {health.db.categories} categorías · {health.db.accounts} cuentas
						</p>
					</>
				) : (
					<p className="mt-2 text-sm text-slate-600">{error ?? "Verificando…"}</p>
				)}
			</Card>
		</>
	);
}
