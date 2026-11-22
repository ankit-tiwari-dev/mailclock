import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.MAILCLOCK_ENCRYPTION_KEY;
  if (!raw) throw new Error("MAILCLOCK_ENCRYPTION_KEY is not set (generate one with: openssl rand -base64 32)");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MAILCLOCK_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

/** Encrypts a JSON-serialisable value. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptJson<T = unknown>(payload: string): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted payload");
  const ivBuf = Buffer.from(iv, "base64url");
  const tagBuf = Buffer.from(tag, "base64url");
  // Fixed lengths: a truncated GCM tag would otherwise be accepted and weaken authentication.
  if (ivBuf.length !== IV_BYTES || tagBuf.length !== TAG_BYTES) throw new Error("Unrecognised encrypted payload");
  const decipher = createDecipheriv(ALGO, getKey(), ivBuf, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tagBuf);
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export const sha256 = (input: string) => createHash("sha256").update(input).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
