const { _electron: electron } = require("@playwright/test");
const { mkdirSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");

async function main() {
  assert.equal(process.platform, "win32");
  const root = process.cwd();
  const output = path.join(root, ".tooling", "windows-smoke");
  const fixture = path.join(output, "project with spaces");
  mkdirSync(fixture, { recursive: true });
  execFileSync("git", ["init", "-b", "main", fixture], { windowsHide: true });
  writeFileSync(path.join(fixture, "README.md"), "Windows scan fixture\n");
  execFileSync("git", ["-C", fixture, "add", "README.md"], { windowsHide: true });
  execFileSync("git", ["-C", fixture, "-c", "user.name=KanVibe QA", "-c", "user.email=qa@example.invalid", "commit", "--allow-empty", "-m", "QA fixture"], { windowsHide: true });
  const app = await electron.launch({ executablePath: require("electron"), args: [root],
    env: { ...process.env, KANVIBE_APP_DATA_DIR: path.join(output, "app-data") }, timeout: 60000 });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => !!window.kanvibeDesktop?.invoke);
    const drives = await page.evaluate(() => window.kanvibeDesktop.invoke("project", "listSubdirectories", [""]));
    assert(drives.includes("C:/") && drives.includes("D:/"));
    const scan = await page.evaluate((directory) => window.kanvibeDesktop.invoke("project", "scanAndRegisterProjects", [directory]), fixture);
    assert.equal(scan.errors.length, 0, JSON.stringify(scan.errors));
    const tasks = await page.evaluate(() => window.kanvibeDesktop.invoke("kanban", "getSearchableTasks", []));
    assert(tasks.length > 0);
    await page.evaluate(async (taskId) => {
      const bridge = window.kanvibeDesktop;
      let unsubscribe;
      const output = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { unsubscribe?.(); reject(new Error("PowerShell output timed out")); }, 15000);
        unsubscribe = bridge.onTerminalData(event => {
          if (event.taskId === taskId && event.data.includes("KANVIBE_WINDOWS_OK")) {
            clearTimeout(timeout); unsubscribe(); resolve();
          }
        });
      });
      await bridge.openTerminal(taskId, null, 80, 24);
      bridge.writeTerminal(taskId, null, "[Console]::WriteLine('KANVIBE_' + 'WINDOWS_OK')\r");
      await output;
    }, tasks[0].id);
    const auth = await page.evaluate(() => window.kanvibeDesktop.invoke("aiAccounts", "listAiAccounts", []));
    assert(auth.some(account => account.provider === "antigravity" && account.isLoggedIn));
    assert(!auth.some(account => account.provider === "gemini"));
    await page.evaluate(() => { location.hash = "#/en/ai-accounts"; });
    await page.getByTestId("ai-accounts-provider-antigravity").waitFor({ timeout: 60000 });
    await page.getByTestId("ai-usage-provider-antigravity").waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(output, "ai-accounts.png"), fullPage: true });
    await page.getByTestId("ai-accounts-provider-antigravity").getByTestId("ai-account-login").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"), undefined, { timeout: 30000 });
    console.log(JSON.stringify({ windowsRuntime: true, powershell: true, drives, scan, antigravityAuthenticated: true, loginAutoClosed: true }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
