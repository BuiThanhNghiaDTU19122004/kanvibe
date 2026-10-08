import { existsSync } from "node:fs";
import path from "node:path";

/** Git for Windows supplies the POSIX shell used by existing Git operations, without WSL. */
export function resolveGitBash(): string {
  const candidates = [
    process.env.KANVIBE_GIT_BASH,
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
    ...(process.env.PATH || "").split(path.delimiter).map((entry) => path.resolve(entry, "..", "bin", "bash.exe")),
  ];
  const shell = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!shell) throw new Error("Install Git for Windows to use local Git operations.");
  return shell;
}
