import { prisma } from "@mailclock/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createApiKey,
  createEmailSchema,
  createProvider,
  decryptJson,
  deleteProvider,
  encryptJson,
  ensureDefaultProject,
  listApiKeys,
  listProviders,
  parseProviderConfig,
  revokeApiKey,
  scheduleEmail,
  setDefaultProvider,
  verifyApiKey,
} from "../src";

let userId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "user", project CASCADE');
  userId = (await prisma.user.create({ data: { id: "u-projects", name: "Owner", email: "owner@example.com" } })).id;
});

afterAll(() => prisma.$disconnect());

describe("projects", () => {
  it("gives a new user one project with a default Mock provider, and is idempotent", async () => {
    const first = await ensureDefaultProject(userId);
    const second = await ensureDefaultProject(userId);
    expect(second.id).toBe(first.id);
    const providers = await listProviders(first.id);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ type: "MOCK", isDefault: true });
    // Credentials are never part of the listing.
    expect(providers[0]).not.toHaveProperty("configEnc");
  });
});

describe("providers", () => {
  it("makes the first provider the default and moves the default on request", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    const a = await createProvider(project.id, { name: "A", type: "MOCK", config: {} });
    const b = await createProvider(project.id, { name: "B", type: "MOCK", config: {} });
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);

    await setDefaultProvider(project.id, b.id);
    const after = await listProviders(project.id);
    expect(after.filter((p) => p.isDefault).map((p) => p.id)).toEqual([b.id]);
  });

  it("stores credentials encrypted", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    const p = await createProvider(project.id, { name: "R", type: "RESEND", config: { apiKey: "re_secret_123" } });
    const row = await prisma.provider.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.configEnc).not.toContain("re_secret_123");
    expect(decryptJson(row.configEnc)).toEqual({ apiKey: "re_secret_123" });
  });

  it("rejects invalid credentials before saving", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    await expect(createProvider(project.id, { name: "R", type: "RESEND", config: { apiKey: "not-a-key" } })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(() => parseProviderConfig("SMTP", { port: 587 })).toThrow(/Invalid provider credentials/);
  });

  it("refuses to delete a provider that pending emails still use", async () => {
    const project = await ensureDefaultProject(userId);
    const [provider] = await listProviders(project.id);
    await scheduleEmail(
      { projectId: project.id, actor: `user:${userId}`, source: "DASHBOARD" },
      createEmailSchema.parse({ to: "a@example.com", subject: "s", text: "t", sendAt: new Date(Date.now() + 3_600_000).toISOString() }),
    );
    await expect(deleteProvider(project.id, provider!.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("deletes an unused provider, and only within its own project", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    const other = await prisma.project.create({ data: { name: "Other", ownerId: userId } });
    const p = await createProvider(project.id, { name: "A", type: "MOCK", config: {} });
    await expect(deleteProvider(other.id, p.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteProvider(project.id, p.id);
    expect(await listProviders(project.id)).toHaveLength(0);
  });
});

describe("API keys", () => {
  it("lists keys without their hash, and a revoked key stops authenticating", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    const { key, record } = await createApiKey({ projectId: project.id, name: "backend", scopes: ["emails:read"] });

    const listed = await listApiKeys(project.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("hash");
    expect(key.startsWith(listed[0]!.prefix)).toBe(true);
    expect((await verifyApiKey(key)).scopes).toEqual(["emails:read"]);

    await revokeApiKey(project.id, record.id);
    await expect(verifyApiKey(key)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(revokeApiKey(project.id, record.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listApiKeys(project.id)).toHaveLength(0);
  });

  it("rejects malformed and unknown keys", async () => {
    await expect(verifyApiKey(null)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(verifyApiKey("bearer-without-mailclock-prefix")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(verifyApiKey("mc_live_doesnotexist")).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("credential encryption", () => {
  it("round-trips, and rejects tampered or truncated payloads", () => {
    const sealed = encryptJson({ pass: "hunter2" });
    expect(decryptJson(sealed)).toEqual({ pass: "hunter2" });

    const [v, iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0]! ^= 1;
    expect(() => decryptJson([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
    // A shortened GCM tag must not be accepted.
    const shortTag = Buffer.from(tag!, "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptJson([v, iv, shortTag, data].join("."))).toThrow(/Unrecognised/);
    expect(() => decryptJson("v2.a.b.c")).toThrow(/Unrecognised/);
  });
});
