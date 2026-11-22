"use client";

import { useTransition } from "react";
import { createProjectAction, switchProjectAction } from "@/app/dashboard/actions";

type P = { id: string; name: string };

export function ProjectSwitcher({ current, projects }: { current: P; projects: P[] }) {
  const [pending, start] = useTransition();
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm">
        <span className="truncate font-medium">{current.name}</span>
        <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="absolute inset-x-0 z-10 mt-1 rounded-md border border-line bg-surface p-1 shadow-lg">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={pending}
            onClick={() => start(() => switchProjectAction(p.id))}
            className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-paper aria-[current=true]:font-medium"
            aria-current={p.id === current.id}
          >
            {p.name}
          </button>
        ))}
        <form action={createProjectAction} className="mt-1 flex gap-1 border-t border-line pt-1">
          <label htmlFor="new-project" className="sr-only">
            New project name
          </label>
          <input
            id="new-project"
            name="name"
            required
            placeholder="New project"
            className="h-8 min-w-0 flex-1 rounded px-2 text-sm placeholder:text-ink-faint focus:outline-none"
          />
          <button type="submit" className="rounded px-2 text-sm font-medium text-cobalt hover:bg-cobalt-wash">
            Create
          </button>
        </form>
      </div>
    </details>
  );
}
