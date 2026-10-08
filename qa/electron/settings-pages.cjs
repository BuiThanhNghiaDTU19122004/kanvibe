// Renderer QA with delayed IPC fixtures; never reads or changes real AI accounts.
const { chromium } = require("@playwright/test");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const messages = require("../../messages/vi.json");
require("tsx/cjs");
const { DEFAULT_SHORTCUT_BINDINGS } = require("../../src/desktop/shared/shortcutBindings.ts");

async function main() {
  const output = path.join(process.cwd(), ".tooling", "settings-pages");
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.KANVIBE_QA_BROWSER || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(({ shortcutBindings }) => {
    const noopSubscription = () => () => {};
    const counts = {};
    window.qaCounts = counts;
    const usage = (percent) => ({ fetchedAt: new Date().toISOString(), accounts: ["claude", "codex", "antigravity"].map((provider) => ({
      provider, accountId: provider, label: `${provider}@example.invalid`, status: "ok", planName: "pro", reason: null,
      fetchedAt: new Date().toISOString(), windows: [{ kind: "weekly", modelName: null, usedPercent: percent, resetsAt: null }],
    })) });
    window.kanvibeDesktop = {
      isDesktop: true, hasTitleBarOverlay: true,
      onBoardEvent: noopSubscription, onTerminalTabShortcut: noopSubscription,
      onShortcutBindingsChanged: noopSubscription, onNotificationActivated: noopSubscription,
      onCreateTaskShortcut: noopSubscription, onNotificationShortcut: noopSubscription, onCommandPaletteShortcut: noopSubscription,
      async invoke(namespace, method, args) {
        counts[method] = (counts[method] || 0) + 1;
        if (method === "getAppSetting") return args[0] === "theme_preference" ? "dracula" : null;
        if (method === "getShortcutBindings") return shortcutBindings;
        if (method === "getNotificationSettings") return { isEnabled: true, enabledStatuses: ["progress", "pending", "review"] };
        if (method === "getBackgroundSyncEnabled") return true;
        if (method === "getBackgroundSyncIntervalMs") return 600_000;
        if (method === "getDefaultSessionType") return "terminal";
        if (method === "getSidebarDefaultCollapsed") return false;
        if (method === "getVimModeEnabled") return true;
        if (method === "getReleaseUpdateDismissedVersions" || method === "getAllProjects") return [];
        if (method === "checkForReleaseUpdate") return { outcome: "up-to-date", update: null };
        if (method === "getCachedAiUsageSnapshot") return usage(22);
        if (method === "getAiUsageSnapshot") {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          return usage(33);
        }
        if (method === "listAiAccounts") {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return ["claude", "codex", "antigravity"].map((provider) => ({ provider, accountRoot: provider,
            accountName: null, label: `${provider}@example.invalid`, isLoggedIn: true, planName: "pro", isRemovable: false }));
        }
        return null;
      },
    };
  }, { shortcutBindings: DEFAULT_SHORTCUT_BINDINGS });
  try {
    await page.goto(`${process.env.KANVIBE_QA_URL || "http://127.0.0.1:5174"}/#/vi/settings`);
    await page.getByRole("heading", { level: 1, name: messages.settings.appearanceSection }).waitFor();
    assert(page.url().endsWith("/settings/appearance"));
    await page.screenshot({ path: path.join(output, "appearance.png") });
    const sections = ["appearance", "detail", "creation", "notifications", "background-sync", "keyboard"];
    for (const section of sections) {
      const link = page.locator(`nav a[href="#/vi/settings/${section}"]`);
      await link.click();
      await page.locator(`main #${section}`).waitFor();
      assert.equal(await link.getAttribute("aria-current"), "page");
      for (const other of sections.filter((value) => value !== section)) {
        assert.equal(await page.locator(`main #${other}`).count(), 0);
      }
    }
    const started = performance.now();
    await page.locator('nav a[href="#/vi/settings/ai-accounts"]').click();
    await page.getByTestId("ai-usage-provider-claude").waitFor();
    const cachedUsageVisibleMs = Math.round(performance.now() - started);
    assert.equal(await page.getByTestId("ai-accounts-provider-claude").count(), 0);
    assert(cachedUsageVisibleMs < 2000, `cached usage took ${cachedUsageVisibleMs}ms`);
    await page.getByTestId("ai-accounts-provider-claude").waitFor();
    await page.screenshot({ path: path.join(output, "ai-accounts.png") });
    await page.locator('nav a[href="#/vi/settings/notifications"]').click();
    await page.locator("main #notifications").waitFor();
    await page.locator('nav a[href="#/vi/settings/ai-accounts"]').click();
    await page.getByTestId("ai-accounts-provider-claude").waitFor();
    const counts = await page.evaluate(() => window.qaCounts);
    assert.equal(counts.getAiUsageSnapshot, 1);
    assert.equal(counts.listAiAccounts, 1);
    assert.equal(counts.getAvailableHosts || 0, 0);
    assert.equal(counts.getAllProjects || 0, 0);
    assert(!requests.some((url) => /AiAccountLoginTerminal|\/xterm-/.test(url)));
    for (const width of [900, 640]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert(!overflow, `horizontal overflow at ${width}px`);
      assert(await page.getByRole("navigation").isVisible());
    }
    await page.screenshot({ path: path.join(output, "ai-accounts-compact.png") });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator('nav a[href="#/vi/settings/shortcuts"]').click();
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert(await page.getByRole("navigation").isVisible());
    await page.locator('nav a[href="#/vi/settings/pane-layout"]').click();
    await page.getByRole("heading", { level: 1, name: messages.paneLayout.title }).waitFor();
    await page.screenshot({ path: path.join(output, "pane-layout.png") });
    assert.deepEqual(errors, []);
    const result = { cachedUsageVisibleMs, counts, errors, screenshots: output };
    writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
