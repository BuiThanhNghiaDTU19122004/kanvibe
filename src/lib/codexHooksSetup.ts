import { registerKanvibeHookTarget } from "@/lib/hookTargetRegistration";
import { readTextFiles } from "@/lib/hostFileAccess";
import { writeHookProviderFiles } from "@/lib/hookFileWriter";
import {
  buildCommandHookEntry,
  buildMatcherCommandHookEntry,
  ensureJsonHookBuckets,
  hasCommandHookEntry,
  hasMatcherCommandHookEntry,
  parseJsonHookSettings,
  serializeJsonHookSettings,
  upsertJsonHookEntries,
} from "@/lib/jsonHookSettings";
import {
  buildShellHookScriptFiles,
  generateShellHookScript,
  isShellHookProviderInstalled,
  readShellHookProviderState,
  resolvePathModule,
  type ShellHookProviderFile,
  type ShellHookScriptDefinition,
  type ShellHookScriptsStatus,
} from "@/lib/shellHookProvider";

/**
 * Codex CLI 최신 hooks 설정은 `.codex/config.toml`의 hooks feature flag와
 * `.codex/hooks.json` 조합을 사용한다.
 */
const AGENT_LABEL = "Codex";
const CONFIG_DIR_NAME = ".codex";
const HOOK_TIMEOUT_SECONDS = 10;
const BASH_MATCHER = "Bash";
const CODEX_HOOKS_FEATURE_FLAG = "hooks";

export const CONFIG_FILE_NAME = "config.toml";
export const HOOKS_FILE_NAME = "hooks.json";
export const PROMPT_HOOK_SCRIPT_NAME = "kanvibe-prompt-hook.sh";
export const PERMISSION_HOOK_SCRIPT_NAME = "kanvibe-permission-hook.sh";
export const PRE_TOOL_HOOK_SCRIPT_NAME = "kanvibe-pre-tool-hook.sh";
export const STOP_HOOK_SCRIPT_NAME = "kanvibe-stop-hook.sh";
export const WINDOWS_HOOK_SCRIPT_NAME = "kanvibe-windows-hook.cjs";

const CODEX_PROMPT_COMMAND = buildCodexHookCommand(PROMPT_HOOK_SCRIPT_NAME);
const CODEX_PERMISSION_COMMAND = buildCodexHookCommand(PERMISSION_HOOK_SCRIPT_NAME);
const CODEX_PRE_TOOL_COMMAND = buildCodexHookCommand(PRE_TOOL_HOOK_SCRIPT_NAME);
const CODEX_STOP_COMMAND = buildCodexHookCommand(STOP_HOOK_SCRIPT_NAME);

const CODEX_HOOK_SCRIPTS: ShellHookScriptDefinition[] = [
  {
    fileName: PROMPT_HOOK_SCRIPT_NAME,
    eventLabel: "UserPromptSubmit",
    description: "사용자가 prompt를 입력하면 현재 task를 PROGRESS로 변경한다.",
    status: "progress",
  },
  {
    fileName: PERMISSION_HOOK_SCRIPT_NAME,
    eventLabel: `PermissionRequest(${BASH_MATCHER})`,
    description: "Codex가 Bash 실행 승인을 요청하면 현재 task를 PENDING으로 변경한다.",
    status: "pending",
  },
  {
    fileName: PRE_TOOL_HOOK_SCRIPT_NAME,
    eventLabel: `PreToolUse(${BASH_MATCHER})`,
    description: "Codex가 Bash 실행을 재개하면 현재 task를 PROGRESS로 변경한다.",
    status: "progress",
  },
  {
    fileName: STOP_HOOK_SCRIPT_NAME,
    eventLabel: "Stop",
    description: "Codex 응답이 완료되면 현재 task를 REVIEW로 변경한다.",
    status: "review",
  },
];

export interface CodexHooksStatus extends Partial<ShellHookScriptsStatus> {
  installed: boolean;
  hasPromptHook: boolean;
  hasPermissionHook: boolean;
  hasPreToolHook: boolean;
  hasStopHook: boolean;
  hasHooksFile: boolean;
  hasHookEntries: boolean;
  hasConfigEntry: boolean;
  hasWindowsHook?: boolean;
}

/** UserPromptSubmit hook bash 스크립트를 생성한다 */
export function generatePromptHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, CODEX_HOOK_SCRIPTS[0], kanvibeUrl, taskId);
}

/** PermissionRequest(Bash) hook bash 스크립트를 생성한다 */
export function generatePermissionHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, CODEX_HOOK_SCRIPTS[1], kanvibeUrl, taskId);
}

/** PreToolUse(Bash) hook bash 스크립트를 생성한다 */
export function generatePreToolHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, CODEX_HOOK_SCRIPTS[2], kanvibeUrl, taskId);
}

/** Stop hook bash 스크립트를 생성한다 */
export function generateStopHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, CODEX_HOOK_SCRIPTS[3], kanvibeUrl, taskId);
}

/** 설치 파일을 만들기 전에 읽어야 하는 기존 설정 파일 경로 */
export function getCodexHookInstallInputPaths(repoPath: string, sshHost?: string | null): string[] {
  return [getCodexConfigPath(repoPath, sshHost), getCodexHooksPath(repoPath, sshHost)];
}

/**
 * Codex CLI hooks 설치 산출물을 만든다.
 * 기존 config.toml / hooks.json이 있으면 KanVibe 관련 항목만 갱신하고 나머지는 보존한다.
 */
export function buildCodexHookFiles(
  repoPath: string,
  taskId: string,
  kanvibeUrl: string,
  configContent: string,
  hooksContent: string,
  sshHost?: string | null,
): ShellHookProviderFile[] {
  const pathModule = resolvePathModule(sshHost);
  const hooksDir = pathModule.join(repoPath, CONFIG_DIR_NAME, "hooks");

  return [
    ...buildShellHookScriptFiles(hooksDir, AGENT_LABEL, CODEX_HOOK_SCRIPTS, kanvibeUrl, taskId, sshHost),
    {
      filePath: pathModule.join(hooksDir, WINDOWS_HOOK_SCRIPT_NAME),
      content: generateCodexWindowsHookScript(kanvibeUrl, taskId),
    },
    {
      filePath: getCodexConfigPath(repoPath, sshHost),
      content: upsertCodexConfigToml(configContent),
    },
    {
      filePath: getCodexHooksPath(repoPath, sshHost),
      content: upsertCodexHooksJson(hooksContent),
    },
  ];
}

export function upsertCodexHooksJson(hooksContent: string): string {
  const settings = parseJsonHookSettings(hooksContent);
  const hooks = ensureJsonHookBuckets(settings);

  hooks.UserPromptSubmit = upsertJsonHookEntries(
    hooks.UserPromptSubmit,
    PROMPT_HOOK_SCRIPT_NAME,
    withWindowsCommand(buildCommandHookEntry(CODEX_PROMPT_COMMAND, HOOK_TIMEOUT_SECONDS), "progress"),
  );
  hooks.PermissionRequest = upsertJsonHookEntries(
    hooks.PermissionRequest,
    PERMISSION_HOOK_SCRIPT_NAME,
    withWindowsCommand(buildMatcherCommandHookEntry(BASH_MATCHER, CODEX_PERMISSION_COMMAND, HOOK_TIMEOUT_SECONDS), "pending"),
  );
  hooks.PreToolUse = upsertJsonHookEntries(
    hooks.PreToolUse,
    PRE_TOOL_HOOK_SCRIPT_NAME,
    withWindowsCommand(buildMatcherCommandHookEntry(BASH_MATCHER, CODEX_PRE_TOOL_COMMAND, HOOK_TIMEOUT_SECONDS), "progress"),
  );
  hooks.Stop = upsertJsonHookEntries(
    hooks.Stop,
    STOP_HOOK_SCRIPT_NAME,
    withWindowsCommand(buildCommandHookEntry(CODEX_STOP_COMMAND, HOOK_TIMEOUT_SECONDS), "review"),
  );

  return serializeJsonHookSettings(settings);
}

/** 지정된 repo에 Codex CLI hooks를 설정한다. 로컬과 원격 repo 모두 같은 산출물을 기록한다 */
export async function setupCodexHooks(
  repoPath: string,
  taskId: string,
  kanvibeUrl: string,
  sshHost?: string | null,
): Promise<void> {
  const configPath = getCodexConfigPath(repoPath, sshHost);
  const hooksPath = getCodexHooksPath(repoPath, sshHost);
  const existingFiles = await readTextFiles([configPath, hooksPath], sshHost);

  await writeHookProviderFiles(
    buildCodexHookFiles(
      repoPath,
      taskId,
      kanvibeUrl,
      existingFiles.get(configPath)?.content ?? "",
      existingFiles.get(hooksPath)?.content ?? "",
      sshHost,
    ),
    sshHost,
  );

  await registerKanvibeHookTarget(repoPath, taskId, kanvibeUrl, sshHost);
}

/** 지정된 repo의 Codex CLI hooks 설치 상태를 확인한다 */
export async function getCodexHooksStatus(
  repoPath: string,
  taskId?: string,
  sshHost?: string | null,
): Promise<CodexHooksStatus> {
  const configPath = getCodexConfigPath(repoPath, sshHost);
  const hooksPath = getCodexHooksPath(repoPath, sshHost);
  const state = await readShellHookProviderState({
    repoPath,
    hooksDir: resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, "hooks"),
    definitions: CODEX_HOOK_SCRIPTS,
    extraFilePaths: [configPath, hooksPath],
    taskId,
    sshHost,
  });
  const [promptScript, permissionScript, preToolScript, stopScript] = state.scriptFiles;
  const hooksFile = state.files.get(hooksPath) ?? { exists: false, content: "" };
  const hasHookEntries = hasCodexHookEntries(hooksFile.content, process.platform === "win32" && !sshHost);
  const hasConfigEntry = hasCodexFeatureFlag(state.files.get(configPath)?.content ?? "");
  const windowsHookPath = resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, "hooks", WINDOWS_HOOK_SCRIPT_NAME);
  const hasWindowsHook = process.platform !== "win32" || Boolean(sshHost)
    || (await readTextFiles([windowsHookPath], sshHost)).get(windowsHookPath)?.exists === true;

  return {
    installed: isShellHookProviderInstalled(state, [hooksFile.exists, hasHookEntries, hasConfigEntry, hasWindowsHook]),
    hasPromptHook: promptScript.exists,
    hasPermissionHook: permissionScript.exists,
    hasPreToolHook: preToolScript.exists,
    hasStopHook: stopScript.exists,
    hasHooksFile: hooksFile.exists,
    hasHookEntries,
    hasConfigEntry,
    hasWindowsHook,
    ...state.status,
  };
}

function hasCodexHookEntries(hooksContent: string, requireWindowsCommand: boolean): boolean {
  const hooks = parseJsonHookSettings(hooksContent).hooks || {};
  const hasCommands = hasCommandHookEntry(hooks.UserPromptSubmit || [], CODEX_PROMPT_COMMAND)
    && hasMatcherCommandHookEntry(hooks.PermissionRequest || [], BASH_MATCHER, CODEX_PERMISSION_COMMAND)
    && hasMatcherCommandHookEntry(hooks.PreToolUse || [], BASH_MATCHER, CODEX_PRE_TOOL_COMMAND)
    && hasCommandHookEntry(hooks.Stop || [], CODEX_STOP_COMMAND);
  if (!hasCommands || !requireWindowsCommand) return hasCommands;
  return ([
    [hooks.UserPromptSubmit, "progress"],
    [hooks.PermissionRequest, "pending"],
    [hooks.PreToolUse, "progress"],
    [hooks.Stop, "review"],
  ] as const).every(([entries, status]) => Array.isArray(entries) && entries.some((entry) =>
    (entry as { hooks?: Array<{ commandWindows?: string }> }).hooks?.some((hook) =>
      hook.commandWindows?.includes(`'${WINDOWS_HOOK_SCRIPT_NAME}'))('${status}')`) ?? false,
    ),
  ));
}

function buildCodexHookCommand(scriptName: string): string {
  return `bash "$(git rev-parse --show-toplevel)/${CONFIG_DIR_NAME}/hooks/${scriptName}"`;
}

function withWindowsCommand<T extends { hooks: Array<{ commandWindows?: string }> }>(entry: T, status: string): T {
  entry.hooks[0].commandWindows = `node -e "require(require('node:path').join(require('node:child_process').execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),'.codex','hooks','${WINDOWS_HOOK_SCRIPT_NAME}'))('${status}')"`;
  return entry;
}

export function generateCodexWindowsHookScript(kanvibeUrl: string, taskId: string): string {
  return `// KanVibe Codex hook for native Windows sessions.\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nmodule.exports = async function updateStatus(status) {\n  try {\n    const repoRoot = path.resolve(__dirname, '..', '..');\n    const stateDir = path.join(repoRoot, '.kanvibe');\n    fs.mkdirSync(stateDir, { recursive: true });\n    fs.writeFileSync(path.join(stateDir, 'status.json'), JSON.stringify({\n      schemaVersion: 1, status, updatedAt: new Date().toISOString(),\n    }) + '\\n');\n    const targetsPath = path.join(stateDir, 'targets.json');\n    let targets = [{ url: ${JSON.stringify(kanvibeUrl)}, taskId: ${JSON.stringify(taskId)} }];\n    if (fs.existsSync(targetsPath)) {\n      const parsed = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));\n      if (Array.isArray(parsed.targets) && parsed.targets.length) targets = parsed.targets;\n    }\n    await Promise.allSettled(targets.map(async ({ url, taskId }) => {\n      if (typeof url !== 'string' || typeof taskId !== 'string') return;\n      await fetch(url.replace(/\\/$/, '') + '/api/hooks/status', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ taskId, status }),\n        signal: AbortSignal.timeout(3000),\n      });\n    }));\n  } catch (_) {\n    // A status notification must never interrupt Codex.\n  }\n};\n`;
}

function getCodexConfigPath(repoPath: string, sshHost?: string | null): string {
  return resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

function getCodexHooksPath(repoPath: string, sshHost?: string | null): string {
  return resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, HOOKS_FILE_NAME);
}

function isSectionHeader(line: string): boolean {
  return /^\s*(?:\[[^\[\]]+\]|\[\[[^\[\]]+\]\])\s*$/.test(line);
}

function findFeaturesSection(lines: string[]) {
  const start = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isSectionHeader(lines[index])) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function stripLegacyKanvibeNotify(configContent: string): string {
  return configContent.replace(/^notify\s*=\s*\["\.codex\/hooks\/kanvibe-notify-hook\.sh"\]\s*\n?/gm, "");
}

export function upsertCodexConfigToml(configContent: string): string {
  const normalized = stripLegacyKanvibeNotify(configContent).replace(/\r\n/g, "\n").trimEnd();
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const featuresSection = findFeaturesSection(lines);

  if (!featuresSection) {
    const prefix = normalized.length > 0 ? `${normalized}\n\n` : "";
    return `${prefix}[features]\n${CODEX_HOOKS_FEATURE_FLAG} = true\n`;
  }

  const beforeFeaturesBody = lines.slice(0, featuresSection.start + 1);
  const featuresBody = lines.slice(featuresSection.start + 1, featuresSection.end);
  const afterFeaturesSection = lines.slice(featuresSection.end);
  const nextFeaturesBody: string[] = [];
  let hasCodexHooksFlag = false;

  for (const line of featuresBody) {
    if (/^\s*codex_hooks\s*=/.test(line)) {
      if (!hasCodexHooksFlag) {
        nextFeaturesBody.push(`${CODEX_HOOKS_FEATURE_FLAG} = true`);
        hasCodexHooksFlag = true;
      }
      continue;
    }

    if (/^\s*(?:hooks|codex_hook)\s*=/.test(line)) {
      continue;
    }

    nextFeaturesBody.push(line);
  }

  if (!hasCodexHooksFlag) {
    nextFeaturesBody.push(`${CODEX_HOOKS_FEATURE_FLAG} = true`);
  }

  return `${[
    ...beforeFeaturesBody,
    ...nextFeaturesBody,
    ...afterFeaturesSection,
  ].join("\n").trimEnd()}\n`;
}

function hasCodexFeatureFlag(configContent: string): boolean {
  const normalized = configContent.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const featuresSection = findFeaturesSection(lines);
  if (!featuresSection) {
    return false;
  }

  return lines.some(
    (line, index) => index > featuresSection.start
      && index < featuresSection.end
      && /^\s*hooks\s*=\s*true\s*$/.test(line),
  );
}
