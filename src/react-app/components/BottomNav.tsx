import { NavLink } from "react-router";

function Icon({ path }: { path: string }) {
	return (
		<svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
			<path d={path} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

const HOME_ICON = "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z";
const LIST_ICON = "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
const CHART_ICON = "M3 21h18M7 17v-5M12 17V7M17 17v-8";
const SETTINGS_ICON =
	"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z";

const tabClass = ({ isActive }: { isActive: boolean }) =>
	`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-emerald-700" : "text-slate-500"}`;

export function BottomNav() {
	return (
		<nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
			<div className="mx-auto flex max-w-md items-center">
				<NavLink to="/" end className={tabClass}>
					<Icon path={HOME_ICON} />
					Inicio
				</NavLink>
				<NavLink to="/movimientos" className={tabClass}>
					<Icon path={LIST_ICON} />
					Movimientos
				</NavLink>
				<NavLink to="/nuevo" className="flex flex-1 justify-center" aria-label="Nuevo movimiento">
					<span className="-mt-6 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-slate-50">
						{/* Ícono dibujado en vez del carácter "+", que la fuente deja corrido hacia abajo. */}
						<svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
							<path d="M12 5v14M5 12h14" strokeLinecap="round" />
						</svg>
					</span>
				</NavLink>
				<NavLink to="/analisis" className={tabClass}>
					<Icon path={CHART_ICON} />
					Análisis
				</NavLink>
				<NavLink to="/ajustes" className={tabClass}>
					<Icon path={SETTINGS_ICON} />
					Ajustes
				</NavLink>
			</div>
		</nav>
	);
}
