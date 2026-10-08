import type { WebContents } from "electron";
import {
  createProviderCliEnvironment,
  getProviderLoginCommand,
  readProviderAuthStatus,
} from "@/lib/aiUsage/providerCli";
import { AI_PROVIDER_CONFIG_DIR_SPECS } from "@/lib/aiUsage/providerConfigDir";
import type { AiLoginProvider } from "@/lib/aiUsage/loginProvider";
import { createLocalShellEnvironment } from "@/lib/shellEnvironment";
import { prepareLoginBrowser } from "./loginBrowser";

/**
 * 계정 로그인은 태스크 터미널이 아니다.
 *
 * 태스크 세션은 작업 행에 묶여 수명주기가 다르므로, 로그인 세션은 자기 레지스트리를 따로 가진다.
 * 이렇게 두면 가짜 태스크를 만들지 않고도 CLI 로그인 화면을 앱 안에서 그대로 보여줄 수 있다.
 */
interface AiAccountLoginSession {
  pty: import("node-pty").IPty;
  disposeBrowser: () => Promise<void>;
  pollTimer?: ReturnType<typeof setTimeout>;
}

const loginSessions = new Map<string, AiAccountLoginSession>();
const pendingLogins = new Map<string, symbol>();

function buildSessionKey(webContentsId: number, accountRoot: string): string {
  return `${webContentsId}:${accountRoot}`;
}

export interface AiAccountLoginOpenResult {
  ok: boolean;
  authenticated?: boolean;
  error?: string;
}

export async function openAiAccountLogin(
  webContents: WebContents,
  provider: AiLoginProvider,
  accountRoot: string,
  cols: number,
  rows: number,
): Promise<AiAccountLoginOpenResult> {
  const sessionKey = buildSessionKey(webContents.id, accountRoot);
  if (loginSessions.has(sessionKey)) {
    return { ok: true };
  }

  if (!["claude", "codex", "antigravity"].includes(provider)) {
    return { ok: false, error: "Unsupported login provider" };
  }
  const pendingToken = Symbol(sessionKey);
  pendingLogins.set(sessionKey, pendingToken);
  const isCancelled = () => pendingLogins.get(sessionKey) !== pendingToken;
  const alreadyAuthenticated = provider === "antigravity"
    && (await readProviderAuthStatus(provider, accountRoot).catch(() => null))?.isLoggedIn;
  if (isCancelled()) return { ok: false, error: "Sign-in cancelled" };
  if (alreadyAuthenticated) {
    pendingLogins.delete(sessionKey);
    return { ok: true, authenticated: true };
  }
  const { command, args } = getProviderLoginCommand(provider);
  const environment = provider === "antigravity" ? createLocalShellEnvironment() : createProviderCliEnvironment(
    AI_PROVIDER_CONFIG_DIR_SPECS[provider],
    accountRoot,
  );

  let ptyProcess: import("node-pty").IPty;
  let disposeBrowser = async () => {};
  try {
    disposeBrowser = await prepareLoginBrowser(environment);
    const pty = await import("node-pty");
    if (isCancelled()) {
      await disposeBrowser();
      return { ok: false, error: "Sign-in cancelled" };
    }
    ptyProcess = pty.spawn(command, args, {
      name: "xterm-color",
      cols,
      rows,
      cwd: environment.HOME,
      env: environment,
    });
  } catch (error) {
    if (!isCancelled()) pendingLogins.delete(sessionKey);
    await disposeBrowser();
    return {
      ok: false,
      error: `Could not start ${command}. Install it in the same environment as KanVibe and try again. ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const session: AiAccountLoginSession = { pty: ptyProcess, disposeBrowser };
  pendingLogins.delete(sessionKey);
  loginSessions.set(sessionKey, session);
  if (provider === "antigravity") {
    const checkLogin = async () => {
      const status = await readProviderAuthStatus(provider, accountRoot).catch(() => null);
      if (loginSessions.get(sessionKey) !== session) return;
      if (status?.isLoggedIn) {
        closeAiAccountLogin(webContents.id, accountRoot);
        if (!webContents.isDestroyed()) webContents.send("kanvibe:ai-login-exit", { accountRoot, exitCode: 0 });
      } else {
        session.pollTimer = setTimeout(() => void checkLogin(), 5000);
      }
    };
    session.pollTimer = setTimeout(() => void checkLogin(), 5000);
  }

  ptyProcess.onData((data) => {
    if (!webContents.isDestroyed()) {
      webContents.send("kanvibe:ai-login-data", { accountRoot, data });
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    clearTimeout(session.pollTimer);
    void disposeBrowser();
    if (loginSessions.get(sessionKey) !== session) return;
    loginSessions.delete(sessionKey);
    if (!webContents.isDestroyed()) {
      webContents.send("kanvibe:ai-login-exit", { accountRoot, exitCode });
    }
  });

  return { ok: true };
}

export function writeAiAccountLogin(
  webContentsId: number,
  accountRoot: string,
  data: string,
): void {
  loginSessions.get(buildSessionKey(webContentsId, accountRoot))?.pty.write(data);
}

export function resizeAiAccountLogin(
  webContentsId: number,
  accountRoot: string,
  cols: number,
  rows: number,
): void {
  loginSessions.get(buildSessionKey(webContentsId, accountRoot))?.pty.resize(cols, rows);
}

export function closeAiAccountLogin(webContentsId: number, accountRoot: string): void {
  const sessionKey = buildSessionKey(webContentsId, accountRoot);
  pendingLogins.delete(sessionKey);
  const session = loginSessions.get(sessionKey);
  if (!session) {
    return;
  }

  loginSessions.delete(sessionKey);
  clearTimeout(session.pollTimer);
  session.pty.kill();
  void session.disposeBrowser();
}

/** 창이 사라지면 그 창이 띄운 로그인 프로세스도 남겨 두지 않는다 */
export function closeWindowAiAccountLogins(webContentsId: number): void {
  for (const key of pendingLogins.keys()) {
    if (key.startsWith(`${webContentsId}:`)) pendingLogins.delete(key);
  }
  for (const sessionKey of [...loginSessions.keys()]) {
    if (sessionKey.startsWith(`${webContentsId}:`)) {
      const session = loginSessions.get(sessionKey);
      clearTimeout(session?.pollTimer);
      loginSessions.delete(sessionKey);
      session?.pty.kill();
      void session?.disposeBrowser();
    }
  }
}
