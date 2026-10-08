import { useLocale, useTranslations } from "next-intl";
import { useLocation, useNavigate } from "react-router-dom";
import { saveLocalePreference } from "@/desktop/renderer/utils/locales";

export default function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("mvp");
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
      <span className="sr-only">{t("language")}</span>
      <select aria-label={t("language")} value={locale} data-terminal-focus-blocker="true"
        className="rounded-md border border-border-default bg-bg-page px-2 py-1.5 text-text-primary"
        onChange={(event) => {
          const next = event.target.value;
          saveLocalePreference(next);
          navigate({ pathname: location.pathname.replace(/^\/[^/]+/, `/${next}`), search: location.search }, { replace: true });
        }}>
        <option value="en">English</option><option value="vi">Tiếng Việt</option>
        {locale === "ko" && <option value="ko">한국어</option>}
        {locale === "zh" && <option value="zh">中文</option>}
      </select>
    </label>
  );
}
