import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "./api";

interface Loaded<T> {
	path: string;
	data?: T;
	error?: string;
}

/**
 * Carga `path` con GET. Mientras llega la respuesta de un path nuevo, `data` conserva el resultado
 * anterior y `stale` es true, para atenuarlo en lugar de mostrar un "Cargando…" que mueve la pantalla.
 */
export function useApiData<T>(path: string) {
	const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

	useEffect(() => {
		let cancelled = false;
		apiFetch<T>(path)
			.then((data) => !cancelled && setLoaded({ path, data }))
			.catch((err) => !cancelled && setLoaded({ path, error: errorMessage(err) }));
		return () => {
			cancelled = true;
		};
	}, [path]);

	const isCurrent = loaded?.path === path;
	return {
		data: loaded?.data,
		error: isCurrent ? (loaded?.error ?? null) : null,
		loading: !loaded,
		stale: Boolean(loaded) && !isCurrent,
	};
}
