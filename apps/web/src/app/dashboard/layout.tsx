import { prisma } from "@mailclock/db";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { NavLink, SignOutButton } from "@/components/client";
import { ProjectSwitcher } from "@/components/project-switcher";
import { requireProject } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, project, projects } = await requireProject();
  const failed = await prisma.email.count({ where: { projectId: project.id, status: "FAILED" } });

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col md:flex-row">
      <aside className="border-line md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" aria-label="Mailclock overview">
            <Logo />
          </Link>
        </div>
        <div className="px-3">
          <ProjectSwitcher current={{ id: project.id, name: project.name }} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
        <nav aria-label="Dashboard" className="mt-4 flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          <NavLink href="/dashboard">Overview</NavLink>
          <NavLink href="/dashboard/emails">Emails</NavLink>
          <NavLink href="/dashboard/failed" badge={failed}>
            Failed
          </NavLink>
          <NavLink href="/dashboard/compose">Schedule an email</NavLink>
          <div className="my-2 hidden border-t border-line md:block" />
          <NavLink href="/dashboard/providers">Providers</NavLink>
          <NavLink href="/dashboard/keys">API keys</NavLink>
          <NavLink href="/dashboard/connect">Connect your app</NavLink>
        </nav>
        <div className="mt-auto hidden border-t border-line px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-[13px] text-ink-faint">{user.email}</p>
          <div className="mt-2">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
