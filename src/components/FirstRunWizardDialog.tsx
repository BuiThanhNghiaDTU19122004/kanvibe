"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  checkEnvironmentAction,
  type CliToolCheckResult,
} from "@/desktop/renderer/actions/environmentCheck";
import { scanAndRegisterProjects } from "@/desktop/renderer/actions/project";
import { setAppSetting } from "@/desktop/renderer/actions/appSettings";

interface FirstRunWizardDialogProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function FirstRunWizardDialog({
  isOpen,
  onComplete,
}: FirstRunWizardDialogProps) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tools, setTools] = useState<CliToolCheckResult[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(true);
  const [scanPath, setScanPath] = useState("");
  const [isScanning, startScanTransition] = useTransition();
  const [scanResultCount, setScanResultCount] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    setIsLoadingTools(true);
    checkEnvironmentAction()
      .then((results) => {
        if (!isCancelled) {
          setTools(results);
          setIsLoadingTools(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoadingTools(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleFinish() {
    await setAppSetting("onboarding_completed", "true");
    onComplete();
  }

  function handleScanProject() {
    if (!scanPath.trim()) return;
    setScanError(null);

    startScanTransition(async () => {
      try {
        const result = await scanAndRegisterProjects(scanPath.trim());
        setScanResultCount(result.registered.length);
        if (result.registered.length > 0) {
          setStep(3);
        } else {
          setScanError(t("noGitReposFound"));
        }
      } catch (error) {
        setScanError(error instanceof Error ? error.message : t("scanFailed"));
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      data-testid="first-run-wizard-dialog"
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl border border-border-default bg-bg-surface p-6 shadow-2xl transition-all">
        {/* Wizard Step Progress */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-text-inverse font-bold text-sm">
              KV
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary leading-tight">
                {t("welcomeTitle")}
              </h2>
              <p className="text-xs text-text-muted">{t("welcomeSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-2 rounded-full transition-all ${
                  step === s
                    ? "w-6 bg-brand-primary"
                    : step > s
                      ? "w-2 bg-brand-primary/50"
                      : "w-2 bg-border-default"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Tool Verification */}
        {step === 1 ? (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("step1Title")}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t("step1Description")}
              </p>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {isLoadingTools ? (
                <div className="flex items-center justify-center py-10 text-xs text-text-muted">
                  {t("checkingTools")}
                </div>
              ) : (
                tools.map((item) => (
                  <div
                    key={item.tool}
                    className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-page/60 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-primary">
                          {item.name}
                        </span>
                        {item.version ? (
                          <span className="truncate text-[10px] text-text-muted font-mono">
                            {item.version}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-text-muted truncate mt-0.5">
                        {item.description}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {item.isInstalled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-success/15 px-2 py-0.5 text-[11px] font-semibold text-status-success">
                          ✓ {t("ready")}
                        </span>
                      ) : (
                        <span
                          title={item.installCommand}
                          className="inline-flex items-center gap-1 rounded-full bg-border-default px-2 py-0.5 text-[11px] font-medium text-text-muted"
                        >
                          {t("notDetected")}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                {t("skipStep")}
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-text-inverse shadow-sm transition-colors hover:bg-brand-hover"
              >
                {t("continue")} →
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 2: Add First Project */}
        {step === 2 ? (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("step2Title")}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t("step2Description")}
              </p>
            </div>

            <div className="space-y-4 my-6">
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1.5">
                  {t("folderPathLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanPath}
                    onChange={(e) => setScanPath(e.target.value)}
                    placeholder="e.g. ~/Projects or D:\code"
                    className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-page px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleScanProject}
                    disabled={isScanning || !scanPath.trim()}
                    className="shrink-0 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-text-inverse disabled:opacity-50 hover:bg-brand-hover"
                  >
                    {isScanning ? t("scanning") : t("scanButton")}
                  </button>
                </div>
                {scanError ? (
                  <p className="text-xs text-status-error mt-2">{scanError}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-border-subtle bg-bg-page/40 p-3 text-xs text-text-muted leading-relaxed">
                💡 {t("scanTip")}
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                ← {tc("back")}
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                {t("skipStep")}
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Finished / Ready */}
        {step === 3 ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-status-success/15 text-status-success">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>

            <h3 className="text-base font-semibold text-text-primary mb-1">
              {t("allSetTitle")}
            </h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto mb-6 leading-relaxed">
              {scanResultCount && scanResultCount > 0
                ? t("allSetDescriptionWithProjects", { count: scanResultCount })
                : t("allSetDescription")}
            </p>

            <button
              type="button"
              onClick={handleFinish}
              data-testid="wizard-finish-btn"
              className="w-full rounded-xl bg-brand-primary py-2.5 text-xs font-semibold text-text-inverse shadow-sm transition-colors hover:bg-brand-hover"
            >
              {t("getStartedButton")} →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
