import type { Context } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

z.config(z.locales.es());

export function badRequest(c: Context, message: string) {
	return c.json({ ok: false, error: "invalid_input", message }, 400);
}

export function notFound(c: Context, message: string) {
	return c.json({ ok: false, error: "not_found", message }, 404);
}

export function conflict(c: Context, message: string) {
	return c.json({ ok: false, error: "conflict", message }, 409);
}

function invalidInput(c: Context, error: z.ZodError) {
	const issue = error.issues[0];
	const field = issue?.path.join(".");
	const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Datos inválidos";
	return badRequest(c, message);
}

export const jsonBody = <T extends z.ZodType>(schema: T) =>
	validator("json", (value, c) => {
		const result = schema.safeParse(value);
		return result.success ? (result.data as z.output<T>) : invalidInput(c, result.error);
	});

export const queryParams = <T extends z.ZodType>(schema: T) =>
	validator("query", (value, c) => {
		const result = schema.safeParse(value);
		return result.success ? (result.data as z.output<T>) : invalidInput(c, result.error);
	});

export const idParam = validator("param", (value, c) => {
	const result = z.object({ id: z.coerce.number().int().positive() }).safeParse(value);
	return result.success ? result.data : notFound(c, "No existe");
});

/** Texto que puede quedar vacío: recorta espacios y guarda "" como null. */
export const nullableText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullable()
		.transform((value) => value || null);

export const idOrNull = z.number().int().positive().nullable();

export function isUniqueViolation(error: unknown): boolean {
	return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
