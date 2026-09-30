import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
	return (
		<header className="flex items-center gap-2 pb-4">
			{back && (
				<Link to={back} className="-ml-2 rounded-full px-2 py-1 text-2xl text-emerald-700" aria-label="Volver">
					‹
				</Link>
			)}
			<h1 className="flex-1 text-2xl font-bold text-slate-900">{title}</h1>
			{action}
		</header>
	);
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
	return <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</section>;
}

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
	primary: "bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-emerald-300",
	secondary: "bg-slate-100 text-slate-800 active:bg-slate-200 disabled:text-slate-400",
	danger: "bg-red-50 text-red-700 active:bg-red-100 disabled:text-red-300",
};

export function Button({
	variant = "primary",
	className = "",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
	return (
		<button
			type="button"
			className={`rounded-xl px-4 py-3 text-base font-semibold transition-colors ${BUTTON_STYLES[variant]} ${className}`}
			{...props}
		/>
	);
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
	return (
		<label className="block">
			<span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
			{children}
			{hint && <span className="mt-1 block text-sm text-slate-500">{hint}</span>}
		</label>
	);
}

export const inputClass =
	"w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

export function ErrorMessage({ children }: { children: ReactNode }) {
	if (!children) return null;
	return (
		<p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
			{children}
		</p>
	);
}

export function Loading() {
	return <p className="py-8 text-center text-slate-500">Cargando…</p>;
}

/** Panel que sube desde abajo, para editar sin salir de la pantalla. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	return (
		<div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-50 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-bold text-slate-900">{title}</h2>
					<button type="button" onClick={onClose} className="px-2 text-2xl text-slate-500" aria-label="Cerrar">
						×
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
