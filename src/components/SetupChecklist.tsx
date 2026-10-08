import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { checkEnvironmentAction } from "@/desktop/renderer/actions/environmentCheck";
import { listAiAccounts } from "@/desktop/renderer/actions/aiAccounts";
import { getAppSetting, setAppSetting } from "@/desktop/renderer/actions/appSettings";
import { usePolledResource } from "@/desktop/renderer/hooks/usePolledValue";
import { Link } from "@/desktop/renderer/navigation";

export default function SetupChecklist({ hasProjects, hasStartedAgent, onSetup, onCreateTask }: {
  hasProjects: boolean; hasStartedAgent: boolean; onSetup: () => void; onCreateTask: () => void;
}) {
  const t = useTranslations("mvp");
  const read = useCallback(async () => {
    const [tools, accounts, completed] = await Promise.all([checkEnvironmentAction(), listAiAccounts(), getAppSetting("onboarding_completed")]);
    return { toolsReady: ["git", "claude"].every((tool) => tools.some((item) => item.tool === tool && item.isInstalled))
      && !tools.some((item) => item.tool === "git-bash" && !item.isInstalled),
    accountReady: accounts.some((account) => account.provider === "claude" && account.accountName === null && account.isLoggedIn), completed: completed === "true" };
  }, []);
  const resource = usePolledResource(read, { toolsReady: false, accountReady: false, completed: false }, 30_000, true);
  const allReady = !resource.error && !!resource.updatedAt && resource.value.toolsReady && resource.value.accountReady && hasProjects && hasStartedAgent;
  useEffect(() => {
    if (allReady && !resource.value.completed) {
      void setAppSetting("onboarding_completed", "true").then(resource.retry).catch(() => {});
    }
  }, [allReady, resource.retry, resource.value.completed]);
  if (resource.value.completed || allReady) return null;
  return <section className="mb-6 rounded-xl border border-brand-primary/30 bg-bg-surface p-4" data-testid="setup-checklist">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-text-primary">{t("finishSetup")}</h2>
      <button type="button" onClick={onSetup} className="text-sm text-brand-primary">{t("continueSetup")}</button></div>
    {resource.error && <p className="mt-2 text-xs text-status-warning">{t("setupCheckFailed")} <button type="button" onClick={resource.retry} className="underline">{t("retry")}</button></p>}
    <div className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-3">
      <button type="button" onClick={onSetup} className="rounded-md border border-border-default p-3 text-left">{resource.value.toolsReady ? "✓ " : "1. "}{t("prepareTools")}</button>
      <Link href="/ai-accounts" className="rounded-md border border-border-default p-3">{resource.value.accountReady ? "✓ " : "2. "}{t("signInClaude")}</Link>
      <button type="button" onClick={hasProjects ? onCreateTask : onSetup} className="rounded-md border border-border-default p-3 text-left">{hasStartedAgent ? "✓ " : "3. "}{t(hasProjects ? "runFirstTask" : "chooseProject")}</button>
    </div>
  </section>;
}
