import { registerKanvibeHookTarget } from "@/lib/hookTargetRegistration";
import { readTextFiles } from "@/lib/hostFileAccess";
import { writeHookProviderFiles } from "@/lib/hookFileWriter";
import { serializeJsonHookSettings } from "@/lib/jsonHookSettings";
import { resolveGitBash } from "@/lib/windowsRuntime";
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

const AGENT_LABEL = "Antigravity CLI";
const CONFIG_DIR_NAME = ".agents";
const SETTINGS_FILE_NAME = "hooks.json";

export const PROMPT_HOOK_SCRIPT_NAME = "kanvibe-prompt-hook.sh";
export const STOP_HOOK_SCRIPT_NAME = "kanvibe-stop-hook.sh";

function hookCommand(script: string, sshHost?: string | null): string {
  const shell = process.platform === "win32" && !sshHost ? `"${resolveGitBash().replaceAll("\\", "/")}"` : "bash";
  return `${shell} "./.agents/hooks/${script}"`;
}

const ANTIGRAVITY_HOOK_SCRIPTS: ShellHookScriptDefinition[] = [
  {
    fileName: PROMPT_HOOK_SCRIPT_NAME,
    eventLabel: "PreInvocation",
    description: "사용자가 prompt를 입력하면 현재 task를 PROGRESS로 변경한다.",
    status: "progress",
  },
  {
    fileName: STOP_HOOK_SCRIPT_NAME,
    eventLabel: "Stop",
    description: "AI 응답이 완료되면 현재 task를 REVIEW로 변경한다.",
    status: "review",
  },
];

export interface AntigravityHooksStatus extends Partial<ShellHookScriptsStatus> {
  installed: boolean;
  hasPromptHook: boolean;
  hasStopHook: boolean;
  hasSettingsEntry: boolean;
}

/** PreInvocation hook bash 스크립트를 생성한다 */
export function generatePromptHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, ANTIGRAVITY_HOOK_SCRIPTS[0], kanvibeUrl, taskId);
}

/** Stop hook bash 스크립트를 생성한다 */
export function generateStopHookScript(kanvibeUrl: string, taskId: string): string {
  return generateShellHookScript(AGENT_LABEL, ANTIGRAVITY_HOOK_SCRIPTS[1], kanvibeUrl, taskId);
}

/** 설치 파일을 만들기 전에 읽어야 하는 기존 설정 파일 경로 */
export function getAntigravityHookInstallInputPaths(repoPath: string, sshHost?: string | null): string[] {
  return [getAntigravitySettingsPath(repoPath, sshHost)];
}

/**
 * Antigravity CLI hooks 설치 산출물을 만든다.
 * 기존 settings.json이 있으면 kanvibe hooks 항목만 갱신하고 나머지는 보존한다.
 */
export function buildAntigravityHookFiles(
  repoPath: string,
  taskId: string,
  kanvibeUrl: string,
  settingsContent: string,
  sshHost?: string | null,
): ShellHookProviderFile[] {
  const pathModule = resolvePathModule(sshHost);
  const hooksDir = pathModule.join(repoPath, CONFIG_DIR_NAME, "hooks");
  // Preserve all user hook namespaces; only KanVibe's entry is replaced.
  const settings = settingsContent.trim() ? JSON.parse(settingsContent) : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid .agents/hooks.json");
  settings.kanvibe = {
    PreInvocation: [{ type: "command", command: hookCommand(PROMPT_HOOK_SCRIPT_NAME, sshHost), timeout: 10 }],
    Stop: [{ type: "command", command: hookCommand(STOP_HOOK_SCRIPT_NAME, sshHost), timeout: 10 }],
  };

  return [
    ...buildShellHookScriptFiles(hooksDir, AGENT_LABEL, ANTIGRAVITY_HOOK_SCRIPTS, kanvibeUrl, taskId, sshHost),
    {
      filePath: getAntigravitySettingsPath(repoPath, sshHost),
      content: serializeJsonHookSettings(settings),
    },
  ];
}

/** 지정된 repo에 Antigravity CLI hooks를 설정한다. 로컬과 원격 repo 모두 같은 산출물을 기록한다 */
export async function setupAntigravityHooks(
  repoPath: string,
  taskId: string,
  kanvibeUrl: string,
  sshHost?: string | null,
): Promise<void> {
  const settingsPath = getAntigravitySettingsPath(repoPath, sshHost);
  const existingFiles = await readTextFiles([settingsPath], sshHost);

  await writeHookProviderFiles(
    buildAntigravityHookFiles(repoPath, taskId, kanvibeUrl, existingFiles.get(settingsPath)?.content ?? "", sshHost),
    sshHost,
  );

  await registerKanvibeHookTarget(repoPath, taskId, kanvibeUrl, sshHost);
}

/** 지정된 repo의 Antigravity CLI hooks 설치 상태를 확인한다 */
export async function getAntigravityHooksStatus(
  repoPath: string,
  taskId?: string,
  sshHost?: string | null,
): Promise<AntigravityHooksStatus> {
  const settingsPath = getAntigravitySettingsPath(repoPath, sshHost);
  const state = await readShellHookProviderState({
    repoPath,
    hooksDir: resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, "hooks"),
    definitions: ANTIGRAVITY_HOOK_SCRIPTS,
    extraFilePaths: [settingsPath],
    taskId,
    sshHost,
  });
  const [promptScript, stopScript] = state.scriptFiles;
  const hasSettingsEntry = hasAntigravitySettingsEntry(state.files.get(settingsPath)?.content ?? "", sshHost);

  return {
    installed: isShellHookProviderInstalled(state, [hasSettingsEntry]),
    hasPromptHook: promptScript.exists,
    hasStopHook: stopScript.exists,
    hasSettingsEntry,
    ...state.status,
  };
}

function hasAntigravitySettingsEntry(settingsContent: string, sshHost?: string | null): boolean {
  try {
    const hooks = JSON.parse(settingsContent).kanvibe;
    const matches = (entries: { type?: string; command?: string }[] | undefined, script: string) =>
      Array.isArray(entries) && entries.some((entry) => entry.type === "command" && entry.command === hookCommand(script, sshHost));
    return matches(hooks?.PreInvocation, PROMPT_HOOK_SCRIPT_NAME) && matches(hooks?.Stop, STOP_HOOK_SCRIPT_NAME);
  } catch { return false; }
}

function getAntigravitySettingsPath(repoPath: string, sshHost?: string | null): string {
  return resolvePathModule(sshHost).join(repoPath, CONFIG_DIR_NAME, SETTINGS_FILE_NAME);
}
