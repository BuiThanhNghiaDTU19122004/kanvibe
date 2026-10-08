import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("repair-current-codex-hooks", () => {
  let repo: string;

  afterEach(async () => {
    if (repo && resolve(repo).startsWith(resolve(tmpdir()) + "\\")) {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== "win32")("repairs and runs each Windows hook", async () => {
    repo = await mkdtemp(join(tmpdir(), "kanvibe-hook-repair-"));
    expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
    await mkdir(join(repo, ".codex"));
    await mkdir(join(repo, "nested"));
    await mkdir(join(repo, ".kanvibe"));
    const events = {
      UserPromptSubmit: "kanvibe-prompt-hook.sh",
      PermissionRequest: "kanvibe-permission-hook.sh",
      PreToolUse: "kanvibe-pre-tool-hook.sh",
      Stop: "kanvibe-stop-hook.sh",
    };
    const hooks = Object.fromEntries(Object.entries(events).map(([event, script]) => [
      event,
      [{ hooks: [{ type: "command", command: `bash ${script}`, timeout: 10 }] }],
    ]));
    await writeFile(join(repo, ".codex", "hooks.json"), JSON.stringify({ hooks }));
    await writeFile(join(repo, ".kanvibe", "targets.json"), JSON.stringify({ targets: [] }));

    const repair = spawnSync("node", [join(process.cwd(), "scripts", "repair-current-codex-hooks.cjs")], {
      cwd: join(repo, "nested"), encoding: "utf8",
    });
    expect(repair.status, repair.stderr).toBe(0);
    const updated = JSON.parse(await readFile(join(repo, ".codex", "hooks.json"), "utf8"));
    for (const [event, status] of [
      ["UserPromptSubmit", "progress"],
      ["PermissionRequest", "pending"],
      ["PreToolUse", "progress"],
      ["Stop", "review"],
    ]) {
      const command = updated.hooks[event][0].hooks[0].commandWindows;
      const run = spawnSync(command, { cwd: join(repo, "nested"), shell: true, encoding: "utf8" });
      expect(run.status, run.stderr).toBe(0);
      const state = JSON.parse(await readFile(join(repo, ".kanvibe", "status.json"), "utf8"));
      expect(state.status).toBe(status);
    }
  });
});
