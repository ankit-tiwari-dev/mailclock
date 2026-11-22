"use server";

import {
  API_KEY_SCOPES,
  MailclockError,
  cancelEmail,
  createApiKey,
  createBatchSchema,
  createProject,
  createProvider,
  deleteProvider,
  rescheduleEmail,
  retryEmail,
  revokeApiKey,
  scheduleBatch,
  setDefaultProvider,
  verifyProviderConfig,
  type ActorContext,
} from "@mailclock/core";
import { prisma, type ProviderType } from "@mailclock/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { PROJECT_COOKIE, requireProject } from "@/lib/session";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function actorContext(): Promise<ActorContext> {
  const { project, actor } = await requireProject();
  return { projectId: project.id, actor, source: "DASHBOARD" };
}

function toError(err: unknown): { ok: false; error: string } {
  if (err instanceof MailclockError) return { ok: false, error: err.message };
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return { ok: false, error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" };
  }
  console.error("[action]", err);
  return { ok: false, error: "Something went wrong. Check the server logs." };
}

async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/dashboard", "layout");
    return { ok: true, data, message };
  } catch (e) {
    return toError(e);
  }
}

// ─── Emails ──────────────────────────────────────────────────────────────────

export async function cancelEmailAction(id: string) {
  return run(async () => void (await cancelEmail(await actorContext(), id)), "Email cancelled");
}

export async function retryEmailAction(id: string) {
  return run(async () => void (await retryEmail(await actorContext(), id)), "Queued for another attempt");
}

/** Re-queues every failed email in the project (up to 1,000 at a time). */
export async function retryAllFailedAction() {
  return run(async () => {
    const ctx = await actorContext();
    const failed = await prisma.email.findMany({
      where: { projectId: ctx.projectId, status: "FAILED" },
      select: { id: true },
      take: 1000,
    });
    for (const { id } of failed) await retryEmail(ctx, id);
    return { count: failed.length };
  });
}

export async function rescheduleEmailAction(id: string, sendAtIso: string) {
  return run(async () => void (await rescheduleEmail(await actorContext(), id, new Date(sendAtIso))), "Rescheduled");
}

export type ComposeInput = {
  to: string[];
  from?: string;
  subject: string;
  body: string;
  format: "text" | "html";
  sendAt?: string;
  staggerSeconds?: number;
  providerId?: string;
};

export async function scheduleFromDashboard(input: ComposeInput) {
  return run(async () => {
    const batch = createBatchSchema.parse({
      staggerSeconds: input.staggerSeconds || undefined,
      emails: input.to.map((to) => ({
        to,
        from: input.from || undefined,
        subject: input.subject,
        [input.format]: input.body,
        sendAt: input.sendAt || undefined,
        providerId: input.providerId || undefined,
      })),
    });
    const { created } = await scheduleBatch(await actorContext(), batch);
    return { count: created.length };
  });
}

// ─── API keys ────────────────────────────────────────────────────────────────

export async function createApiKeyAction(input: { name: string; readOnly: boolean; dailyQuota?: number }) {
  return run(async () => {
    const { project } = await requireProject();
    if (!input.name.trim()) throw new MailclockError("validation_error", "Give the key a name so you can recognise it later");
    const { key } = await createApiKey({
      projectId: project.id,
      name: input.name.trim(),
      scopes: input.readOnly ? ["emails:read"] : [...API_KEY_SCOPES],
      dailyQuota: input.dailyQuota,
    });
    return { key };
  });
}

export async function revokeApiKeyAction(id: string) {
  return run(async () => {
    const { project } = await requireProject();
    await revokeApiKey(project.id, id);
  }, "Key revoked");
}

// ─── Providers ───────────────────────────────────────────────────────────────

export type ProviderFormInput = {
  name: string;
  type: ProviderType;
  config: Record<string, unknown>;
  defaultFrom?: string;
  ratePerHour?: number;
  verify: boolean;
};

export async function createProviderAction(input: ProviderFormInput) {
  return run(async () => {
    const { project } = await requireProject();
    if (input.verify) await verifyProviderConfig(input.type, input.config);
    await createProvider(project.id, {
      name: input.name.trim() || input.type,
      type: input.type,
      config: input.config,
      defaultFrom: input.defaultFrom,
      ratePerHour: input.ratePerHour,
    });
  }, "Provider added");
}

export async function setDefaultProviderAction(id: string) {
  return run(async () => {
    const { project } = await requireProject();
    await setDefaultProvider(project.id, id);
  });
}

export async function deleteProviderAction(id: string) {
  return run(async () => {
    const { project } = await requireProject();
    await deleteProvider(project.id, id);
  }, "Provider removed");
}

// ─── Projects ────────────────────────────────────────────────────────────────

const cookieOptions = { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" } as const;

export async function switchProjectAction(projectId: string) {
  const { projects } = await requireProject();
  if (projects.some((p) => p.id === projectId)) (await cookies()).set(PROJECT_COOKIE, projectId, cookieOptions);
  redirect("/dashboard");
}

export async function createProjectAction(formData: FormData) {
  const { user } = await requireProject();
  const project = await createProject(user.id, String(formData.get("name") ?? ""));
  (await cookies()).set(PROJECT_COOKIE, project.id, cookieOptions);
  redirect("/dashboard/providers");
}
