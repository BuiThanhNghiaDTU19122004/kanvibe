import { execFile } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { getProjectRepository, getTaskRepository } from "@/lib/database";
import { createLocalShellEnvironment } from "@/lib/shellEnvironment";
import { resolveTaskWorkingDirectory } from "@/lib/taskWorkingDirectory";

const VS_CODE_COMMAND = "code";
const VS_CODE_LAUNCH_TIMEOUT_MS = 10_000;

export interface EditorOpenResult {
  ok: boolean;
  error?: string;
}

export interface VsCodeExecutionPlan {
  file: string;
  args: string[];
  options?: {
    windowsVerbatimArguments?: boolean;
  };
}

/**
 * cmd.exe 인자를 이스케이프한다.
 * 공백이나 cmd 메타문자(&, |, <, >, ^, %, !)가 포함된 경우 큰따옴표로 감싸고 내부 큰따옴표는 ""로 이스케이프한다.
 */
export function escapeCmdArg(arg: string): string {
  if (!arg) {
    return '""';
  }
  if (/[\s"&|<>^%!]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

/**
 * Windows에서 VS Code 실행 스크립트(code.cmd) 또는 실행 파일을 찾는다.
 */
export function findWindowsVsCodeCommand(env: NodeJS.ProcessEnv = process.env): string | null {
  const localAppData = env.LOCALAPPDATA || "";
  const programFiles = env.ProgramFiles || "";
  const programFilesX86 = env["ProgramFiles(x86)"] || "";

  const candidatePaths = [
    localAppData ? path.win32.join(localAppData, "Programs", "Microsoft VS Code", "bin", "code.cmd") : null,
    localAppData ? path.win32.join(localAppData, "Programs", "Microsoft VS Code Insiders", "bin", "code-insiders.cmd") : null,
    programFiles ? path.win32.join(programFiles, "Microsoft VS Code", "bin", "code.cmd") : null,
    programFilesX86 ? path.win32.join(programFilesX86, "Microsoft VS Code", "bin", "code.cmd") : null,
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const pathDirs = (env.PATH || "").split(path.win32.delimiter);
  const extensions = [".cmd", ".bat", ".exe"];
  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.win32.join(dir, `code${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * 플랫폼별로 VS Code 실행 명령과 인자를 구성한다.
 * Windows(win32)에서는 Node.js의 CVE-2024-27980 패치로 인해 .cmd/.bat을 shell 없이 execFile하면 EINVAL이 발생하고,
 * "code"만 호출하면 ENOENT가 발생한다.
 * 따라서 cmd.exe를 통해 code.cmd를 실행하고 windowsVerbatimArguments로 공백이 든 경로도 안전하게 전달한다.
 */
export function buildVsCodeExecution(
  args: string[],
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): VsCodeExecutionPlan {
  if (platform === "win32") {
    const codeCmd = findWindowsVsCodeCommand(env) || "code";
    const comSpec = env.ComSpec || "cmd.exe";
    const commandLine = `"${codeCmd}" ${args.map(escapeCmdArg).join(" ")}`;
    return {
      file: comSpec,
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      options: { windowsVerbatimArguments: true },
    };
  }

  return {
    file: VS_CODE_COMMAND,
    args,
  };
}

/**
 * VS Code CLI 인자를 만든다.
 * 원격 작업이라도 명령은 항상 로컬에서 돈다. 원격 셸에서 `code`를 실행하면 그 머신에서 창을 띄우려 하고,
 * Remote-SSH의 `code` 셔틀은 이미 Remote-SSH로 붙은 통합 터미널 안에서만 로컬로 넘어오기 때문이다.
 * 그래서 원격은 로컬 VS Code에 `--remote ssh-remote+<host>`로 붙을 곳을 알려 주는 방향으로 뒤집는다.
 */
export function buildVsCodeOpenArgs(targetPath: string, sshHost: string | null): string[] {
  return sshHost ? ["--remote", `ssh-remote+${sshHost}`, targetPath] : [targetPath];
}

/**
 * 작업을 열 경로와 호스트를 정한다.
 * worktree가 있으면 그 작업의 실제 작업 사본이므로 프로젝트 저장소보다 먼저 쓴다.
 */
async function resolveTaskEditorTarget(taskId: string): Promise<{ targetPath: string; sshHost: string | null } | null> {
  const taskRepo = await getTaskRepository();
  const task = await taskRepo.findOneBy({ id: taskId });
  if (!task) {
    return null;
  }

  const project = task.projectId
    ? await (await getProjectRepository()).findOneBy({ id: task.projectId })
    : null;
  const targetPath = resolveTaskWorkingDirectory({ worktreePath: task.worktreePath, project });
  if (!targetPath) {
    return null;
  }

  return { targetPath, sshHost: task.sshHost || project?.sshHost || null };
}

/** 작업 폴더를 로컬 VS Code로 연다. 원격 작업이면 Remote-SSH로 붙어서 연다 */
export async function openTaskInVsCode(
  taskId: string,
  platform: string = process.platform,
): Promise<EditorOpenResult> {
  const target = await resolveTaskEditorTarget(taskId);
  if (!target) {
    return { ok: false, error: "no-target-path" };
  }

  const env = createLocalShellEnvironment();
  const vsCodeArgs = buildVsCodeOpenArgs(target.targetPath, target.sshHost);
  const plan = buildVsCodeExecution(vsCodeArgs, platform, env);

  return new Promise((resolve) => {
    execFile(
      plan.file,
      plan.args,
      {
        env,
        timeout: VS_CODE_LAUNCH_TIMEOUT_MS,
        windowsVerbatimArguments: plan.options?.windowsVerbatimArguments,
      },
      (error) => {
        if (error) {
          console.error("VS Code 실행 실패:", error);
          resolve({ ok: false, error: error.message });
          return;
        }

        resolve({ ok: true });
      },
    );
  });
}

