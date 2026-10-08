import { useCallback, useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { createTerminalOptions } from "@/lib/terminalMouseSelection";
import { installOsc52ClipboardHandler } from "@/lib/terminalClipboard";
import type { AiLoginProvider } from "@/lib/aiUsage/loginProvider";

interface AiAccountLoginTerminalProps {
  provider: AiLoginProvider;
  /** 로그인 세션은 태스크가 아니라 계정 루트로 식별한다 */
  accountRoot: string;
  onExit: (exitCode: number) => void;
}

const LOGIN_TERMINAL_FONT_FAMILY = "monospace";

/**
 * provider CLI의 로그인 화면을 앱 안에서 그대로 보여준다.
 *
 * 브라우저로 넘어가는 provider는 안내만 지나가지만, Antigravity처럼 첫 실행 화면에서 인증 방식을
 * 골라야 하는 CLI는 사용자가 여기서 직접 고를 수 있어야 터미널로 나가지 않는다.
 */
export default function AiAccountLoginTerminal({
  provider,
  accountRoot,
  onExit,
}: AiAccountLoginTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);

  onExitRef.current = onExit;

  const connect = useCallback(async (isCancelled: () => boolean) => {
    if (!containerRef.current) {
      return undefined;
    }

    const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/addon-web-links"),
    ]);
    if (isCancelled() || !containerRef.current) return undefined;

    const terminal = new XTerm(createTerminalOptions(LOGIN_TERMINAL_FONT_FAMILY));
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((_event, url) => {
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    }));
    terminal.open(containerRef.current);
    const osc52ClipboardHandler = installOsc52ClipboardHandler(terminal);

    const isThisSession = (event: { accountRoot: string }) => event.accountRoot === accountRoot;

    const unsubscribeData = window.kanvibeDesktop?.onAiAccountLoginData?.((event: {
      accountRoot: string;
      data: string;
    }) => {
      if (isThisSession(event)) {
        terminal.write(event.data);
      }
    });

    const unsubscribeExit = window.kanvibeDesktop?.onAiAccountLoginExit?.((event: {
      accountRoot: string;
      exitCode: number;
    }) => {
      if (isThisSession(event)) {
        if (event.exitCode === 0) {
          onExitRef.current(event.exitCode);
        } else {
          terminal.writeln(`\r\n\x1b[31mLogin exited with code ${event.exitCode}. Close this panel and try again.\x1b[0m`);
        }
      }
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        resolve();
      });
    });

    if (isCancelled()) {
      osc52ClipboardHandler.dispose();
      unsubscribeData?.();
      unsubscribeExit?.();
      terminal.dispose();
      return undefined;
    }
    const loginReady = await window.kanvibeDesktop?.openAiAccountLogin?.(
      provider,
      accountRoot,
      terminal.cols,
      terminal.rows,
    );

    if (!loginReady?.ok) {
      terminal.writeln(`\r\n\x1b[31m${loginReady?.error || "로그인 명령을 실행하지 못했습니다."}\x1b[0m`);
      return () => {
        osc52ClipboardHandler.dispose();
        unsubscribeData?.();
        unsubscribeExit?.();
        terminal.dispose();
      };
    }

    if (loginReady.authenticated) onExitRef.current(0);

    terminal.onData((data) => {
      window.kanvibeDesktop?.writeAiAccountLogin?.(accountRoot, data);
    });

    terminal.focus();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      window.kanvibeDesktop?.resizeAiAccountLogin?.(accountRoot, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      osc52ClipboardHandler.dispose();
      unsubscribeData?.();
      unsubscribeExit?.();
      window.kanvibeDesktop?.closeAiAccountLogin?.(accountRoot);
      terminal.dispose();
    };
  }, [accountRoot, provider]);

  useEffect(() => {
    let isDisposed = false;
    let cleanup: (() => void) | undefined;

    void connect(() => isDisposed)
      .then((dispose) => {
        if (isDisposed) {
          dispose?.();
          return;
        }

        cleanup = dispose;
      })
      .catch((error) => {
        console.error("AI 계정 로그인 터미널 초기화 실패:", error);
      });

    return () => {
      isDisposed = true;
      window.kanvibeDesktop?.closeAiAccountLogin?.(accountRoot);
      cleanup?.();
    };
  }, [connect, accountRoot]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 w-full flex-1 overflow-hidden rounded-md bg-terminal-bg p-2"
      data-testid="ai-account-login-terminal"
    />
  );
}
