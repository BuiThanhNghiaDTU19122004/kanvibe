import { useTranslations } from "next-intl";
import { Link } from "@/desktop/renderer/navigation";

export default function LoadError({ onRetry, inline = false }: { onRetry: () => void; inline?: boolean }) {
  const t = useTranslations("mvp");
  return (
    <div role="alert" className={inline ? "m-4 rounded-lg border border-status-warning/40 bg-bg-surface p-4" : "flex min-h-screen flex-col items-center justify-center gap-3 bg-bg-page p-6"}>
      <p className="text-sm font-medium text-status-warning">{t("loadFailed")}</p>
      <p className="mt-1 text-sm text-text-muted">{t("loadFailedHint")}</p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" onClick={onRetry} className="rounded-md bg-brand-primary px-4 py-2 text-sm text-text-inverse">{t("retry")}</button>
        {!inline && <Link href="/" className="text-sm text-brand-primary">{t("backToDashboard")}</Link>}
      </div>
    </div>
  );
}
