import "server-only";
import { ensureDefaultProject, listProjects } from "@mailclock/core";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export const PROJECT_COOKIE = "mc_project";

/** The signed-in user, or a redirect to /login. Cached per request. */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
});

/** The user's active project (from a cookie, falling back to their first project). */
export const requireProject = cache(async () => {
  const user = await requireUser();
  let projects = await listProjects(user.id);
  if (projects.length === 0) {
    await ensureDefaultProject(user.id);
    projects = await listProjects(user.id);
  }
  const selected = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === selected) ?? projects[0]!;
  return { user, project, projects, actor: `user:${user.id}` };
});
