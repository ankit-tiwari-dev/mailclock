import { prisma } from "@mailclock/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createApiKey,
  createEmailSchema,
  createProvider,
  decryptJson,
  describeActor,
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

  it("refuses a Resend From address on a webmail domain, which Resend can never send from", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    for (const from of ["someone@gmail.com", "Name <someone@Outlook.com>"]) {
      await expect(
        createProvider(project.id, { name: "R", type: "RESEND", config: { apiKey: "re_test_1" }, defaultFrom: from }),
      ).rejects.toMatchObject({ code: "validation_error", message: expect.stringMatching(/verified in Resend/) });
    }
    // Resend's own test sender and custom domains are fine; SMTP may legitimately use webmail.
    await expect(createProvider(project.id, { name: "R", type: "RESEND", config: { apiKey: "re_test_1" }, defaultFrom: "Mailclock <onboarding@resend.dev>" })).resolves.toBeTruthy();
    await expect(createProvider(project.id, { name: "S", type: "SMTP", config: { host: "smtp.gmail.com" }, defaultFrom: "me@gmail.com" })).resolves.toBeTruthy();
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

describe("describeActor", () => {
  it("names keys and owners only within the project", async () => {
    const mine = await prisma.project.create({ data: { name: "Mine", ownerId: userId } });
    const stranger = await prisma.user.create({ data: { id: "u-stranger", name: "Stranger", email: "s@example.com" } });
    const theirs = await prisma.project.create({ data: { name: "Theirs", ownerId: stranger.id } });
    const { record: myKey } = await createApiKey({ projectId: mine.id, name: "backend" });
    const { record: theirKey } = await createApiKey({ projectId: theirs.id, name: "their secret name" });

    expect(await describeActor(mine.id, `key:${myKey.id}`)).toBe('API key "backend"');
    expect(await describeActor(mine.id, `user:${userId}`)).toBe("Owner");
    expect(await describeActor(mine.id, `key:${theirKey.id}`)).toBe("a deleted API key");
    expect(await describeActor(mine.id, `user:${stranger.id}`)).toBe("a former member");
  });
});

describe("limits (sharp edges, 2026-11-22)", () => {
  // dailyQuota 0 used to mean "unlimited" and ratePerHour -1 made a provider never send.
  it("accepts only no-limit or a positive whole number", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(createApiKey({ projectId: project.id, name: "k", dailyQuota: bad })).rejects.toMatchObject({ code: "validation_error" });
      await expect(createProvider(project.id, { name: "m", type: "MOCK", config: {}, ratePerHour: bad })).rejects.toMatchObject({
        code: "validation_error",
      });
    }
    expect((await createApiKey({ projectId: project.id, name: "k", dailyQuota: null })).record.dailyQuota).toBeNull();
    expect((await createProvider(project.id, { name: "m", type: "MOCK", config: {}, ratePerHour: 10 })).ratePerHour).toBe(10);
  });

  it("the database refuses out-of-range limits even from a direct write", async () => {
    const project = await prisma.project.create({ data: { name: "P", ownerId: userId } });
    const p = await createProvider(project.id, { name: "m", type: "MOCK", config: {} });
    await expect(prisma.provider.update({ where: { id: p.id }, data: { ratePerHour: -1 } })).rejects.toThrow();
    const { record } = await createApiKey({ projectId: project.id, name: "k" });
    await expect(prisma.apiKey.update({ where: { id: record.id }, data: { dailyQuota: 0 } })).rejects.toThrow();
  });
});

describe("encryption key", () => {
  it("refuses a placeholder key such as all zero bytes, or a typed passphrase", () => {
    const real = process.env.MAILCLOCK_ENCRYPTION_KEY;
    try {
      for (const weak of [Buffer.alloc(32, 0), Buffer.from("x".repeat(32)), Buffer.from("password1234password1234password")]) {
        process.env.MAILCLOCK_ENCRYPTION_KEY = weak.toString("base64");
        expect(() => encryptJson({ a: 1 })).toThrow(/placeholder/);
      }
    } finally {
      process.env.MAILCLOCK_ENCRYPTION_KEY = real;
    }
    expect(() => encryptJson({ a: 1 })).not.toThrow();
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
