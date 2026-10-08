// Repair the project-local Codex hooks used by an existing Windows checkout.
// Run with Node from anywhere inside the checkout, outside a read-only sandbox.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const hooksPath = path.join(repoRoot, ".codex", "hooks.json");
const scriptPath = path.join(repoRoot, ".codex", "hooks", "kanvibe-windows-hook.cjs");
const settings = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
const events = {
  UserPromptSubmit: ["kanvibe-prompt-hook.sh", "progress"],
  PermissionRequest: ["kanvibe-permission-hook.sh", "pending"],
  PreToolUse: ["kanvibe-pre-tool-hook.sh", "progress"],
  Stop: ["kanvibe-stop-hook.sh", "review"],
};

for (const [event, [shellScript, status]] of Object.entries(events)) {
  const handler = settings.hooks?.[event]?.flatMap((entry) => entry.hooks ?? [])
    .find((hook) => hook.type === "command" && hook.command?.includes(shellScript));
  if (!handler) throw new Error(`Missing KanVibe ${event} hook in ${hooksPath}`);
  handler.commandWindows = `node -e "require(require('node:path').join(require('node:child_process').execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),'.codex','hooks','kanvibe-windows-hook.cjs'))('${status}')"`;
}

const script = `const fs = require('node:fs');
const path = require('node:path');

module.exports = async function updateStatus(status) {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const stateDir = path.join(repoRoot, '.kanvibe');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'status.json'), JSON.stringify({
      schemaVersion: 1, status, updatedAt: new Date().toISOString(),
    }) + '\\n');
    const targetsPath = path.join(stateDir, 'targets.json');
    if (!fs.existsSync(targetsPath)) return;
    const { targets } = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
    if (!Array.isArray(targets)) return;
    await Promise.allSettled(targets.map(async ({ url, taskId }) => {
      if (typeof url !== 'string' || typeof taskId !== 'string') return;
      await fetch(url.replace(/\\/$/, '') + '/api/hooks/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status }),
        signal: AbortSignal.timeout(3000),
      });
    }));
  } catch (_) {
    // Status notifications must never interrupt Codex.
  }
};
`;

fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
fs.writeFileSync(scriptPath, script);
fs.writeFileSync(hooksPath, JSON.stringify(settings, null, 2) + "\n");
console.log(`Updated ${hooksPath} and ${scriptPath}`);
