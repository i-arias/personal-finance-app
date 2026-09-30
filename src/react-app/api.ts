import type { ApiError } from "../shared/api";

export const SESSION_EXPIRED_EVENT = "session-expired";

export class RequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

/**
 * Llama a la API y devuelve el JSON. Si la sesión de Access venció, Access responde con una
 * redirección a su página de login: se avisa a la app para que ofrezca volver a iniciar sesión.
 */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path, {
			method: init.method ?? "GET",
			headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			redirect: "manual",
		});
	} catch {
		throw new RequestError("Sin conexión. Revisa tu internet e inténtalo de nuevo.", 0);
	}

	if (res.type === "opaqueredirect" || res.status === 401) {
		window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
		throw new RequestError("Tu sesión expiró.", 401);
	}

	const isJson = res.headers.get("Content-Type")?.includes("application/json");
	const data: unknown = isJson ? await res.json() : null;
	if (!res.ok) {
		const message = (data as ApiError | null)?.message ?? "Ocurrió un error inesperado.";
		throw new RequestError(message, res.status);
	}
	return data as T;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
