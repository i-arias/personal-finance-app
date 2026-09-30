/** Para comparar textos sin importar mayúsculas, tildes ni espacios repetidos: "  ÉXITO  Laureles" → "exito laureles". */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}
