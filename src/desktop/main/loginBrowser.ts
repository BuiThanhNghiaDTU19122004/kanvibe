import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

export async function openExternalBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported browser URL");
  if (process.platform === "linux" && (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)) {
    const encodedUrl = Buffer.from(url, "utf8").toString("base64");
    const command = `Start-Process -FilePath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedUrl}')))`;
    await new Promise<void>((resolve, reject) => {
      execFile("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", [
        "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64"),
      ], { timeout: 15_000 }, (error) => error ? reject(error) : resolve());
    });
    return;
  }
  const { shell } = await import("electron");
  await shell.openExternal(url);
}

// Base64 keeps OAuth query strings out of PowerShell command syntax.
export const WSL_BROWSER_SCRIPT = `#!/bin/sh
set -eu
case "\${1:-}" in
  https://*|http://localhost:*|http://127.0.0.1:*) ;;
  *) echo 'Unsupported browser URL' >&2; exit 1 ;;
esac
url64=$(printf '%s' "$1" | base64 -w0)
script="Start-Process -FilePath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$url64')))"
encoded=$(printf '%s' "$script" | iconv -f UTF-8 -t UTF-16LE | base64 -w0)
exec /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -EncodedCommand "$encoded"
`;

export async function prepareLoginBrowser(environment: Record<string, string>): Promise<() => Promise<void>> {
  if (process.platform !== "linux" || !(environment.WSL_DISTRO_NAME || environment.WSL_INTEROP)) {
    return async () => {};
  }

  const directory = await mkdtemp(path.join(tmpdir(), "kanvibe-login-browser-"));
  try {
    // Cover both BROWSER-aware clients and native clients that call xdg-open.
    const opener = path.join(directory, "xdg-open");
    await writeFile(opener, WSL_BROWSER_SCRIPT, { mode: 0o700 });
    environment.BROWSER = opener;
    environment.PATH = `${directory}${path.delimiter}${environment.PATH || ""}`;
    return () => rm(directory, { recursive: true, force: true });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
