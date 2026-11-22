import { prisma, type ProviderType } from "@mailclock/db";
import { encryptJson } from "./crypto";
import { MailclockError } from "./errors";
import { createTransport, parseProviderConfig } from "./providers";

// ─── Projects ────────────────────────────────────────────────────────────────

export function listProjects(userId: string) {
  return prisma.project.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}

export function createProject(userId: string, name: string) {
  return prisma.project.create({ data: { name: name.trim() || "My project", ownerId: userId } });
}

/** Returns the project if the user may access it, else throws `not_found` (never leaks existence). */
export async function getProjectForUser(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) throw new MailclockError("not_found", "Project not found");
  return project;
}

/**
 * Every new user gets a project with a Mock provider, so the very first
 * scheduled email works end-to-end before any credentials are added.
 */
export async function ensureDefaultProject(userId: string) {
  const existing = await prisma.project.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const project = await createProject(userId, "My project");
  await createProvider(project.id, {
    name: "Mock (no emails leave Mailclock)",
    type: "MOCK",
    config: {},
    defaultFrom: "Mailclock <hello@example.com>",
    isDefault: true,
  });
  return project;
}

// ─── Providers ───────────────────────────────────────────────────────────────

export type ProviderInput = {
  name: string;
  type: ProviderType;
  config: unknown;
  defaultFrom?: string | null;
  ratePerHour?: number | null;
  isDefault?: boolean;
};

const publicProviderFields = {
  id: true,
  name: true,
  type: true,
  defaultFrom: true,
  ratePerHour: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function listProviders(projectId: string) {
  return prisma.provider.findMany({
    where: { projectId },
    select: publicProviderFields,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/** Checks credentials by connecting to the provider (no email is sent). */
export async function verifyProviderConfig(type: ProviderType, config: unknown) {
  const transport = createTransport(type, parseProviderConfig(type, config));
  try {
    await transport.verify();
  } catch (err) {
    throw new MailclockError("validation_error", `Could not connect: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    transport.close?.();
  }
}

export async function createProvider(projectId: string, input: ProviderInput) {
  const config = parseProviderConfig(input.type, input.config);
  const isFirst = (await prisma.provider.count({ where: { projectId } })) === 0;
  const makeDefault = input.isDefault || isFirst;
  return prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.provider.updateMany({ where: { projectId }, data: { isDefault: false } });
    return tx.provider.create({
      data: {
        projectId,
        name: input.name,
        type: input.type,
        configEnc: encryptJson(config),
        defaultFrom: input.defaultFrom || null,
        ratePerHour: input.ratePerHour || null,
        isDefault: makeDefault,
      },
      select: publicProviderFields,
    });
  });
}

export async function setDefaultProvider(projectId: string, providerId: string) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.provider.updateMany({ where: { id: providerId, projectId }, data: { isDefault: true } });
    if (!count) throw new MailclockError("not_found", "Provider not found");
    await tx.provider.updateMany({ where: { projectId, id: { not: providerId } }, data: { isDefault: false } });
  });
}

export async function deleteProvider(projectId: string, providerId: string) {
  const pending = await prisma.email.count({
    where: { projectId, providerId, status: { in: ["SCHEDULED", "RETRYING", "SENDING"] } },
  });
  if (pending) {
    throw new MailclockError("invalid_state", `${pending} pending email(s) use this provider. Cancel them or wait until they are sent.`);
  }
  const { count } = await prisma.provider.deleteMany({ where: { id: providerId, projectId } });
  if (!count) throw new MailclockError("not_found", "Provider not found");
}

// ─── API keys (listing / revoking; creation lives in api-keys.ts) ───────────

export function listApiKeys(projectId: string) {
  return prisma.apiKey.findMany({
    where: { projectId, revokedAt: null },
    select: { id: true, name: true, prefix: true, scopes: true, dailyQuota: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(projectId: string, keyId: string) {
  const { count } = await prisma.apiKey.updateMany({
    where: { id: keyId, projectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw new MailclockError("not_found", "API key not found");
}
