import { randomBytes } from "node:crypto";
import { prisma } from "@mailclock/db";
import { sha256 } from "./crypto";
import { MailclockError, parseLimit } from "./errors";

export const API_KEY_SCOPES = ["emails:read", "emails:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const KEY_PREFIX = "mc_live_";

export function generateApiKey() {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 4), hash: sha256(key) };
}

export async function createApiKey(input: {
  projectId: string;
  name: string;
  scopes?: ApiKeyScope[];
  dailyQuota?: number | null;
}) {
  const { key, prefix, hash } = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      prefix,
      hash,
      scopes: input.scopes ?? [...API_KEY_SCOPES],
      dailyQuota: parseLimit(input.dailyQuota, "Daily limit"),
    },
  });
  // The plaintext key is returned exactly once.
  return { key, record };
}

export type AuthenticatedKey = { id: string; projectId: string; scopes: string[]; dailyQuota: number | null };

/** Resolves a bearer token to an active API key, or throws `unauthorized`. */
export async function verifyApiKey(token: string | null | undefined): Promise<AuthenticatedKey> {
  if (!token || !token.startsWith(KEY_PREFIX)) throw new MailclockError("unauthorized", "Missing or malformed API key");
  const record = await prisma.apiKey.findUnique({ where: { hash: sha256(token) } });
  if (!record || record.revokedAt) throw new MailclockError("unauthorized", "Invalid or revoked API key");
  // Best-effort usage tracking; never block the request on it.
  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: record.id, projectId: record.projectId, scopes: record.scopes, dailyQuota: record.dailyQuota };
}

export const hasScope = (key: AuthenticatedKey, scope: ApiKeyScope) => key.scopes.includes(scope);

export function requireScope(key: AuthenticatedKey, scope: ApiKeyScope) {
  if (!hasScope(key, scope)) throw new MailclockError("forbidden", `This API key lacks the "${scope}" scope`);
}
