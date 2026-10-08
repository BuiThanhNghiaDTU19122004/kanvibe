"use client";
import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { checkEnvironmentAction, type CliToolCheckResult } from "@/desktop/renderer/actions/environmentCheck";
import { scanAndRegisterProjects } from "@/desktop/renderer/actions/project";
import { listAiAccounts } from "@/desktop/renderer/actions/aiAccounts";
import { setAppSetting } from "@/desktop/renderer/actions/appSettings";
import { Link } from "@/desktop/renderer/navigation";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import FolderSearchInput from "./FolderSearchInput";
import LanguageSelector from "./LanguageSelector";

interface Props { isOpen: boolean; onComplete: () => void; onCreateTask?: () => void; projectCount?: number }
export default function FirstRunWizardDialog(props: Props) { return props.isOpen ? <Wizard {...props} /> : null; }

function Wizard({ onComplete, onCreateTask, projectCount = 0 }: Props) {
  const t = useTranslations("onboarding");
  const tm = useTranslations("mvp");
  const [step, setStep] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, [step]);
  const [tools, setTools] = useState<CliToolCheckResult[]>([]);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [scanPath, setScanPath] = useState("");
  const [projectReady, setProjectReady] = useState(projectCount > 0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, startScanTransition] = useTransition();
  const [finishing, setFinishing] = useState(false);
  const load = useCallback(async () => {
    setChecking(true); setCheckError(false);
    try {
      const [result, accounts] = await Promise.all([checkEnvironmentAction(), listAiAccounts()]);
      setTools(result); setAccountReady(accounts.some((account) => account.provider === "claude" && account.accountName === null && account.isLoggedIn));
    } catch { setCheckError(true); setAccountReady(false); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toolsReady = ["git", "claude"].every((tool) => tools.some((item) => item.tool === tool && item.isInstalled))
    && !tools.some((item) => item.tool === "git-bash" && !item.isInstalled);
  const ready = toolsReady && accountReady && projectReady && !checkError;
  async function finish(create = false) {
    if (finishing || isScanning) return;
    setFinishing(true);
    try { await setAppSetting("onboarding_seen", "true"); if (create && onCreateTask) onCreateTask(); else onComplete(); }
    catch { setScanError(tm("setupSaveFailed")); }
    finally { setFinishing(false); }
  }
  useEscapeKey(() => { void finish(); }, { enabled: !isScanning && !finishing });
  function scan() {
    setScanError(null);
    startScanTransition(async () => {
      try {
        const result = await scanAndRegisterProjects(scanPath.trim());
        if (result.errors.length) setScanError(result.errors.join("\n"));
        if (result.registered.length || result.skipped.length) { setProjectReady(true); if (!result.errors.length) setStep(3); }
        else if (!result.errors.length) setScanError(t("noGitReposFound"));
      } catch (error) { setScanError(error instanceof Error ? error.message : t("scanFailed")); }
    });
  }
  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("title")} data-terminal-focus-blocker="true" data-testid="first-run-wizard-dialog"
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const items = [...dialogRef.current!.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])")];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    className="fixed inset-0 z-[500] flex items-center justify-center bg-bg-overlay p-4">
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border-default bg-bg-surface p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-text-primary">{t("welcomeTitle")}</h2><LanguageSelector /></div>
      <div className="mb-6 flex gap-2">{[1, 2, 3].map((value) => <span key={value} className={`h-1.5 flex-1 rounded-full ${step >= value ? "bg-brand-primary" : "bg-border-default"}`} />)}</div>
      <h3 className="font-semibold text-text-primary">{t(`step${step}Title`)}</h3>
      {step === 1 && <div className="mt-3 space-y-3">
        <p className="text-sm text-text-muted">{tm("setupToolsHint")}</p>
        {checking ? <p className="text-sm text-text-muted">{t("checkingTools")}</p> : <>
          {checkError && <p role="alert" className="text-sm text-status-warning">{tm("setupCheckFailed")}</p>}
          {tools.filter((item) => ["git", "git-bash", "claude"].includes(item.tool)).map((item) => <div key={item.tool} className="rounded-lg border border-border-default p-3">
            <div className="flex justify-between gap-3 text-sm"><strong className="text-text-primary">{item.name}</strong><span className={item.isInstalled ? "text-status-success" : "text-status-warning"}>{item.isInstalled ? t("ready") : t("notDetected")}</span></div>
            {!item.isInstalled && item.installCommand && <code className="mt-2 block break-all text-xs text-text-secondary">{item.installCommand}</code>}
          </div>)}
          <div className="flex flex-wrap items-center gap-3"><Link href="/ai-accounts" className="text-sm text-brand-primary">{accountReady ? tm("accountSignedIn") : tm("signInClaude")}</Link>
            <button type="button" onClick={() => { void load(); }} className="text-sm text-brand-primary">{tm("recheck")}</button></div>
        </>}
      </div>}
      {step === 2 && <div className="mt-3 space-y-4">
        <p className="text-sm text-text-muted">{t("step2Description")}</p>
        <label className="block text-sm text-text-secondary">{t("folderPathLabel")}</label>
        <FolderSearchInput name="onboarding-project-path" onSelect={setScanPath} placeholder="D:/projects/" />
        <p className="text-xs text-text-muted">{t("scanTip")}</p>
        <button type="button" disabled={isScanning || !scanPath.trim()} onClick={scan} className="rounded-md bg-brand-primary px-4 py-2 text-sm text-text-inverse disabled:opacity-50">{isScanning ? t("scanning") : t("scanButton")}</button>
        {projectReady && <p className="text-sm text-status-success">{tm("projectReady")}</p>}
      </div>}
      {step === 3 && <div className="mt-3 space-y-4">
        <p className="text-sm text-text-muted">{tm(ready ? "firstTaskHint" : "setupIncomplete")}</p>
        <button type="button" disabled={!ready || finishing} onClick={() => { void finish(true); }} data-testid="wizard-finish-btn"
          className="w-full rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-text-inverse disabled:opacity-50">{tm("runFirstTask")}</button>
        {!ready && <button type="button" onClick={() => setStep(!toolsReady || !accountReady ? 1 : 2)} className="text-sm text-brand-primary">{tm("continueSetup")}</button>}
      </div>}
      {scanError && <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-status-warning">{scanError}</p>}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <button type="button" disabled={isScanning || finishing} onClick={() => { void finish(); }} className="text-sm text-text-muted">{t("skipStep")}</button>
        {step > 1 && <button type="button" disabled={isScanning} onClick={() => setStep(step - 1)} className="text-sm text-text-secondary">{tm("back")}</button>}
        {step < 3 && <button type="button" disabled={isScanning || (step === 1 ? checking || !toolsReady || !accountReady : !projectReady)}
          onClick={() => setStep(step + 1)} className="rounded-md bg-brand-primary px-4 py-2 text-sm text-text-inverse disabled:opacity-50">{t("continue")}</button>}
        {step < 3 && <button type="button" disabled={isScanning} onClick={() => setStep(step + 1)} className="text-xs text-text-muted">{tm("skipThisStep")}</button>}
      </div>
    </div>
  </div>;
}
