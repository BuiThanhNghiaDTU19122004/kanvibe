#!/usr/bin/env node

const { existsSync } = require("node:fs");
const path = require("node:path");
const { execPnpmSync, spawnPnpm } = require("./package-runtime.cjs");

const REQUIRED_NODE_MAJOR = 24;
const RENDERER_ENTRY_PATH = path.join(process.cwd(), "build", "renderer", "index.html");
const MAIN_ENTRY_PATH = path.join(process.cwd(), "build", "main", "src", "desktop", "main", "serviceRegistry.js");

function getNodeMajor() {
  return Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
}

function hasBetterSqlite3Installed() {
  try {
    require.resolve("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

function ensureSupportedNodeVersion() {
  if (getNodeMajor() === REQUIRED_NODE_MAJOR) {
    return;
  }

  console.error(
    `[kanvibe] Unsupported Node.js runtime ${process.versions.node}. KanVibe desktop start requires Node ${REQUIRED_NODE_MAJOR}.x.`,
  );
  console.error(`[kanvibe] Run \`nvm use ${REQUIRED_NODE_MAJOR}\` and then retry \`pnpm start\`.`);
  process.exit(1);
}

function installProjectDependencies() {
  console.warn("[kanvibe] Installing project dependencies because better-sqlite3 is missing...");
  execPnpmSync(["install"], {
    stdio: "inherit",
    env: process.env,
  });
}

function ensureAppBuild() {
  if (existsSync(RENDERER_ENTRY_PATH) && existsSync(MAIN_ENTRY_PATH)) {
    return;
  }

  console.warn("[kanvibe] Desktop build not found. Running `pnpm build` first...");
  execPnpmSync(["build"], {
    stdio: "inherit",
    env: process.env,
  });
}

function main() {
  ensureSupportedNodeVersion();

  if (!hasBetterSqlite3Installed()) {
    installProjectDependencies();
  }

  ensureAppBuild();

  const child = spawnPnpm(["exec", "electron", "--no-sandbox", "."], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (error) => {
    console.error("[kanvibe] Could not start Electron:", error.message);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) console.error(`[kanvibe] Electron stopped with signal ${signal}.`);
    process.exit(code ?? 1);
  });
}

main();
