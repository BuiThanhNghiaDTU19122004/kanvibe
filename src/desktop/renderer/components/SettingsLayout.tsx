import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Outlet, useLocation } from "react-router-dom";
import LanguageSelector from "@/components/LanguageSelector";
import { Link } from "@/desktop/renderer/navigation";

export default function SettingsLayout() {
  const t = useTranslations("settings");
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const isMacDesktop = window.kanvibeDesktop?.isDesktop === true
    && /mac/i.test(navigator.platform || navigator.userAgent);
  const items = [
    ["appearance", t("appearanceSection")],
    ["detail", t("detailPageSection")],
    ["creation", t("taskCreationSection")],
    ["notifications", t("notificationSection")],
    ["background-sync", t("backgroundSyncSection")],
    ["keyboard", t("keyboardSection")],
    ["shortcuts", t("shortcutsLink")],
    ["ai-accounts", t("aiAccountsLink")],
    ["pane-layout", t("paneLayoutLink")],
  ];

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="flex h-screen min-h-0 bg-bg-page text-text-primary" data-testid="settings-layout">
      <aside className={`w-44 shrink-0 overflow-y-auto border-r border-border-default bg-bg-surface px-3 pb-6 sm:w-56 ${isMacDesktop ? "pt-16" : "pt-6"}`}>
        <Link href="/" className="mb-8 inline-flex items-center gap-3 px-3 text-sm text-text-muted hover:text-text-primary">
          <span aria-hidden="true">←</span> Board
        </Link>
        <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("title")}</h2>
        <nav aria-label={t("title")} className="space-y-1">
          {items.map(([id, label]) => {
            const active = pathname.endsWith(`/settings/${id}`);
            return (
              <Link key={id} href={`/settings/${id}`} aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-brand-subtle font-medium text-brand-primary" : "text-text-secondary hover:bg-bg-page hover:text-text-primary"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main ref={contentRef} className={`min-w-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-8 lg:px-10 ${isMacDesktop ? "pt-16" : "pt-6"}`}>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-6 flex justify-end"><LanguageSelector /></div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
