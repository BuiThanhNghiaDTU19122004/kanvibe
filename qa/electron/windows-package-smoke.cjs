const { _electron: electron } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const output = path.resolve('.tooling/windows-package-smoke');
  mkdirSync(output, { recursive: true });
  const env = { ...process.env, KANVIBE_APP_DATA_DIR: path.join(output, 'app-data') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.resolve('dist/windows/win-unpacked/KanVibe.exe'),
    args: ['--no-sandbox'],
    env,
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => !!window.kanvibeDesktop?.invoke);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    const drives = await page.evaluate(() => window.kanvibeDesktop.invoke('project', 'listSubdirectories', ['']));
    assert(drives.includes('C:/') && drives.includes('D:/'));
    const tasks = await page.evaluate(() => window.kanvibeDesktop.invoke('kanban', 'getSearchableTasks', []));
    assert(Array.isArray(tasks));
    await page.screenshot({ path: path.join(output, 'packaged-app.png') });
    console.log(JSON.stringify({ packaged: true, renderer: true, ipc: true, sqlite: true, drives }));
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
