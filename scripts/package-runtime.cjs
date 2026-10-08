const { existsSync } = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

function pnpmCommand(args) {
  if (process.platform !== "win32") return ["pnpm", args];
  const candidates = [path.join(__dirname, "..", ".tooling", "pnpm", "node_modules", "pnpm", "bin", "pnpm.cjs"), process.env.npm_execpath,
    ...(process.env.PATH || "").split(path.delimiter).map((entry) => path.join(entry, "node_modules", "pnpm", "bin", "pnpm.cjs"))];
  const entry = candidates.find((file) => file && /pnpm\.(c?js)$/.test(file) && existsSync(file));
  if (!entry) throw new Error("Install pnpm for Windows, then run pnpm start.");
  return [process.execPath, [entry, ...args]];
}
exports.execPnpmSync = (args, options) => execFileSync(...pnpmCommand(args), { windowsHide: true, ...options });
exports.spawnPnpm = (args, options) => spawn(...pnpmCommand(args), { windowsHide: true, ...options });
