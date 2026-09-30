import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { canAccess, parseList, verifyAccessToken, type AccessConfig } from "../src/worker/auth";

const SERVICE_TOKEN_ID = "0123456789abcdef.access";

const config: AccessConfig = {
	teamDomain: "https://equipo-de-prueba.cloudflareaccess.com",
	aud: "aud-de-prueba",
	allowedEmails: ["yo@example.com"],
	allowedServiceTokens: [SERVICE_TOKEN_ID],
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let keySet: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256");
	privateKey = pair.privateKey;
	otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
	const publicJwk = await exportJWK(pair.publicKey);
	keySet = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "llave-1", alg: "RS256" }] });
});

function signToken(
	claims: { email?: string; common_name?: string; iss?: string; aud?: string; exp?: string | number } = {},
	key: CryptoKey = privateKey,
) {
	const { iss, aud, exp, ...custom } = claims;
	return new SignJWT(custom)
		.setProtectedHeader({ alg: "RS256", kid: "llave-1" })
		.setIssuer(iss ?? config.teamDomain)
		.setAudience(aud ?? config.aud)
		.setIssuedAt()
		.setExpirationTime(exp ?? "1h")
		.sign(key);
}

describe("verifyAccessToken con personas", () => {
	it("acepta un token válido de un correo autorizado", async () => {
		const token = await signToken({ email: "yo@example.com" });
		expect(await verifyAccessToken(token, keySet, config)).toEqual({ kind: "user", email: "yo@example.com" });
	});

	it("compara el correo sin distinguir mayúsculas", async () => {
		const token = await signToken({ email: "Yo@Example.COM" });
		expect(await verifyAccessToken(token, keySet, config)).toEqual({ kind: "user", email: "yo@example.com" });
	});

	it("rechaza un correo que no está autorizado", async () => {
		const token = await signToken({ email: "otra@example.com" });
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza un token sin correo ni Service Token", async () => {
		const token = await signToken();
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza un token de otra aplicación (AUD distinto)", async () => {
		const token = await signToken({ email: "yo@example.com", aud: "otra-app" });
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza un token de otro equipo (issuer distinto)", async () => {
		const token = await signToken({ email: "yo@example.com", iss: "https://otro.cloudflareaccess.com" });
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza un token vencido", async () => {
		const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
		const token = await signToken({ email: "yo@example.com", exp: oneHourAgo });
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza un token firmado con otra llave", async () => {
		const token = await signToken({ email: "yo@example.com" }, otherPrivateKey);
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});
});

describe("verifyAccessToken con Service Tokens (Atajos)", () => {
	it("acepta un Service Token autorizado por su Client ID", async () => {
		const token = await signToken({ common_name: SERVICE_TOKEN_ID });
		expect(await verifyAccessToken(token, keySet, config)).toEqual({ kind: "service", clientId: SERVICE_TOKEN_ID });
	});

	it("rechaza un Service Token que no está en la lista", async () => {
		const token = await signToken({ common_name: "otro-token.access" });
		expect(await verifyAccessToken(token, keySet, config)).toBeNull();
	});

	it("rechaza Service Tokens si no hay ninguno configurado", async () => {
		const token = await signToken({ common_name: SERVICE_TOKEN_ID });
		expect(await verifyAccessToken(token, keySet, { ...config, allowedServiceTokens: [] })).toBeNull();
	});
});

describe("canAccess", () => {
	const user = { kind: "user", email: "yo@example.com" } as const;
	const service = { kind: "service", clientId: SERVICE_TOKEN_ID } as const;

	it("una persona puede usar toda la API", () => {
		expect(canAccess(user, "/api/transactions")).toBe(true);
		expect(canAccess(user, "/api/ingest/apple-pay")).toBe(true);
	});

	it("el Service Token solo puede registrar movimientos", () => {
		expect(canAccess(service, "/api/ingest/apple-pay")).toBe(true);
		expect(canAccess(service, "/api/transactions")).toBe(false);
		expect(canAccess(service, "/api/export.csv")).toBe(false);
		expect(canAccess(service, "/api/ingest")).toBe(false);
	});
});

describe("parseList", () => {
	it("separa por comas, quita espacios y pasa a minúsculas", () => {
		expect(parseList(" Yo@Example.com, otra@example.com ,,")).toEqual(["yo@example.com", "otra@example.com"]);
	});

	it("tolera un valor vacío o ausente", () => {
		expect(parseList("")).toEqual([]);
		expect(parseList(undefined)).toEqual([]);
	});
});
