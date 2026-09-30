import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppEnv } from "./types";

export interface AccessConfig {
	teamDomain: string; // https://<equipo>.cloudflareaccess.com
	aud: string; // Application Audience (AUD) Tag
	allowedEmails: string[];
	/** Client IDs de los Service Tokens autorizados (terminan en ".access"). */
	allowedServiceTokens: string[];
}

/** Quién hizo la petición: una persona (con correo) o un Service Token de Access (el Atajo del iPhone). */
export type AccessIdentity = { kind: "user"; email: string } | { kind: "service"; clientId: string };

/** Los Service Tokens solo pueden registrar movimientos; el resto de la API es solo para personas. */
export const SERVICE_TOKEN_PATH_PREFIX = "/api/ingest/";

// Las llaves públicas de Access se guardan en memoria por isolate para no pedirlas en cada request.
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function accessKeySet(teamDomain: string): JWTVerifyGetKey {
	let keySet = remoteKeySets.get(teamDomain);
	if (!keySet) {
		keySet = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
		remoteKeySets.set(teamDomain, keySet);
	}
	return keySet;
}

/** "a@x.com, B@y.com" → ["a@x.com", "b@y.com"] */
export function parseList(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

/** Devuelve la identidad si el token de Access es válido para esta app y está autorizada; si no, null. */
export async function verifyAccessToken(
	token: string,
	keySet: JWTVerifyGetKey,
	config: AccessConfig,
): Promise<AccessIdentity | null> {
	try {
		const { payload } = await jwtVerify(token, keySet, {
			issuer: config.teamDomain,
			audience: config.aud,
		});
		if (typeof payload.email === "string") {
			const email = payload.email.toLowerCase();
			return config.allowedEmails.includes(email) ? { kind: "user", email } : null;
		}
		// Los Service Tokens no traen correo: traen su Client ID en common_name.
		const clientId = typeof payload.common_name === "string" ? payload.common_name.toLowerCase() : null;
		return clientId && config.allowedServiceTokens.includes(clientId) ? { kind: "service", clientId } : null;
	} catch {
		return null;
	}
}

export function canAccess(identity: AccessIdentity, path: string): boolean {
	return identity.kind === "user" || path.startsWith(SERVICE_TOKEN_PATH_PREFIX);
}

function isLocalhost(url: string): boolean {
	const { hostname } = new URL(url);
	return hostname === "localhost" || hostname === "127.0.0.1";
}

export const requireAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (c.env.DEV_BYPASS_AUTH === "true" && isLocalhost(c.req.url)) {
		c.set("user", "dev@localhost");
		return next();
	}

	const token = c.req.header("Cf-Access-Jwt-Assertion");
	const { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: aud } = c.env;
	if (!token || !teamDomain || !aud) {
		return c.json({ ok: false, error: "unauthorized" }, 401);
	}

	const identity = await verifyAccessToken(token, accessKeySet(teamDomain), {
		teamDomain,
		aud,
		allowedEmails: parseList(c.env.ALLOWED_EMAILS),
		allowedServiceTokens: parseList(c.env.ACCESS_SERVICE_TOKENS),
	});
	if (!identity || !canAccess(identity, c.req.path)) {
		return c.json({ ok: false, error: "unauthorized" }, 401);
	}

	c.set("user", identity.kind === "user" ? identity.email : "Atajo del iPhone");
	await next();
};
