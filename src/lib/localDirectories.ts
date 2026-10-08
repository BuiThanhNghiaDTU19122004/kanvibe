import { readdir, access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export function resolveLocalDirectory(value: string): string {
  const expanded = value.replace(/^~(?=$|[\\/])/, homedir());
  return path.resolve(/^[a-z]:$/i.test(expanded) ? `${expanded}/` : expanded);
}

export async function listLocalDirectories(value: string): Promise<string[]> {
  if (process.platform === "win32" && value === "") {
    const drives = await Promise.all(Array.from({ length: 26 }, async (_, i) => {
      const drive = `${String.fromCharCode(65 + i)}:/`;
      return await access(drive).then(() => drive, () => null);
    }));
    return drives.filter((drive): drive is string => drive !== null);
  }
  const entries = await readdir(resolveLocalDirectory(value), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

export async function scanLocalGitRepos(value: string): Promise<string[]> {
  const found: string[] = [];
  const ignored = new Set(["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information"]);
  async function visit(directory: string, depth: number): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (depth === 0) throw error;
      return [];
    });
    if (entries.some((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()))) {
      found.push(directory);
    }
    if (depth >= 3) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !ignored.has(entry.name)) {
        await visit(path.join(directory, entry.name), depth + 1);
      }
    }
  }
  await visit(resolveLocalDirectory(value), 0);
  return found;
}
