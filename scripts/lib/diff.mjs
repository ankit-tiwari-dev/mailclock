// Shared diff plumbing for the diff-scoped checks (ownership-check.mjs).
// Reads the change between the merge base with `base` and the working tree, including staged,
// unstaged, and untracked files, and returns added lines with their line numbers.
import { execFileSync } from "node:child_process";

export class DiffError extends Error {}

const git = (args, { diffExit = false } = {}) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });
  } catch (e) {
    // `git diff --no-index` exits 1 when the sides differ, which is normal for a new file.
    return diffExit && e.status === 1 && typeof e.stdout === "string" ? e.stdout : null;
  }
};

/** Moves to the top of the work tree and returns its path. */
export function repoRoot() {
  const top = git(["rev-parse", "--show-toplevel"])?.trim();
  if (!top) throw new DiffError("not inside a git work tree");
  process.chdir(top);
  return top;
}

/** @returns {{ file: string, line: number, text: string }[]} lines added since the merge base */
export function addedLines(base) {
  const mergeBase = git(["merge-base", base, "HEAD"])?.trim();
  if (!mergeBase) throw new DiffError(`no merge base against ${base}`);
  const tracked = git(["diff", "--unified=0", mergeBase, "--"]);
  if (tracked === null) throw new DiffError(`could not diff against ${mergeBase}`);
  const untrackedList = git(["ls-files", "--others", "--exclude-standard"]);
  if (untrackedList === null) throw new DiffError("could not list untracked files");
  const untracked = untrackedList
    .split("\n")
    .filter(Boolean)
    .map((f) => {
      const d = git(["diff", "--no-index", "--unified=0", "/dev/null", f], { diffExit: true });
      if (d === null) throw new DiffError(`could not diff untracked file ${f}`);
      return d;
    })
    .join("\n");

  const out = [];
  let file = null;
  let line = 0;
  let inHeader = false;
  for (const raw of `${tracked}\n${untracked}`.split("\n")) {
    if (raw.startsWith("diff ")) inHeader = true;
    else if (raw.startsWith("@@")) {
      inHeader = false;
      line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
    } else if (inHeader) {
      if (raw.startsWith("+++ ")) file = raw.slice(4) === "/dev/null" ? null : raw.slice(4).replace(/^b\//, "");
    } else if (file && raw.startsWith("+")) {
      out.push({ file, line, text: raw.slice(1) });
      line++;
    } else if (raw.startsWith(" ")) line++;
  }
  return out;
}
