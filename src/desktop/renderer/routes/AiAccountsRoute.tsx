import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AiProviderIcon } from "@/components/AiProviderIcon";
import LoadError from "@/components/LoadError";
import { invalidateAiUsage } from "@/desktop/renderer/hooks/useAiUsage";
import AiUsagePanel from "@/desktop/renderer/components/AiUsagePanel";
import {
  addAiAccount,
  listAiAccounts,
  removeAiAccount,
} from "@/desktop/renderer/actions/aiAccounts";
import type { AiAccountSummary } from "@/desktop/main/services/aiAccountService";
import type { AiUsageProvider } from "@/lib/aiUsage/types";
import type { AiLoginProvider } from "@/lib/aiUsage/loginProvider";

const AiAccountLoginTerminal = lazy(() => import("@/desktop/renderer/components/AiAccountLoginTerminal"));

const ACCOUNT_CACHE_DURATION_MS = 60_000;

// Keep account checks off the navigation path and deduplicate concurrent opens.
let cachedAccounts: AiAccountSummary[] | null = null;
let accountsFetchedAt = 0;
let accountsRequest: Promise<AiAccountSummary[]> | null = null;

async function readAccounts(force: boolean) {
  if (force && accountsRequest) await accountsRequest.catch(() => undefined);
  if (!force && cachedAccounts && Date.now() - accountsFetchedAt < ACCOUNT_CACHE_DURATION_MS) return cachedAccounts;
  if (!accountsRequest) {
    accountsRequest = listAiAccounts().then((accounts) => {
      cachedAccounts = accounts;
      accountsFetchedAt = Date.now();
      return accounts;
    }).finally(() => { accountsRequest = null; });
  }
  return accountsRequest;
}

const AI_USAGE_PROVIDERS: AiUsageProvider[] = ["claude", "codex", "antigravity"];

/** 로그인 화면이 열려 있는 계정. 계정 루트가 세션을 가리킨다 */
interface ActiveLoginSession {
  provider: AiLoginProvider;
  accountRoot: string;
}

interface ProviderAccountGroup {
  provider: AiUsageProvider;
  accounts: AiAccountSummary[];
}

function groupAccountsByProvider(accounts: AiAccountSummary[]): ProviderAccountGroup[] {
  return AI_USAGE_PROVIDERS.map((provider) => ({
    provider,
    accounts: accounts.filter((account) => account.provider === provider),
  }));
}

function AccountRow({
  account,
  isLoginOpen,
  onLogin,
  onRemove,
}: {
  account: AiAccountSummary;
  isLoginOpen: boolean;
  onLogin: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("aiAccounts");

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-page px-3 py-2"
      data-testid="ai-account-row"
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm text-text-primary"
          title={account.label}
          data-testid="ai-account-label"
        >
          {account.label}
        </p>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {account.isLoggedIn ? t("loggedIn") : t("loggedOut")}
        </p>
      </div>

      {account.planName ? (
        <span className="shrink-0 rounded bg-bg-surface px-1.5 py-0.5 text-[10px] uppercase text-text-muted">
          {account.planName}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onLogin}
        disabled={isLoginOpen}
        className="shrink-0 rounded-md bg-brand-primary px-2 py-1 text-[11px] text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        data-testid="ai-account-login"
      >
        {account.isLoggedIn ? t(account.provider === "antigravity" ? "checkConnection" : "relogin") : t("login")}
      </button>

      {account.isRemovable ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-md border border-border-default px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
          data-testid="ai-account-remove"
        >
          {t("remove")}
        </button>
      ) : null}
    </div>
  );
}

function AddAccountForm({
  provider,
  onAdded,
}: {
  provider: AiUsageProvider;
  onAdded: (accountRoot: string) => void;
}) {
  const t = useTranslations("aiAccounts");
  const [accountName, setAccountName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  async function submitAccountName() {
    if (isAdding) return;
    setIsAdding(true);
    try {
    const result = await addAiAccount(provider, accountName.trim());
    if (result.outcome !== "ok" || !result.accountRoot) {
      setErrorKey(result.outcome);
      return;
    }

    setErrorKey(null);
    setAccountName("");
    onAdded(result.accountRoot);
    } catch { setErrorKey("operationFailed"); }
    finally { setIsAdding(false); }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder={t("accountNamePlaceholder")}
          className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-page px-2 py-1 text-xs text-text-primary"
          data-testid="ai-account-name-input"
        />
        <button
          type="button"
          onClick={() => void submitAccountName()}
          disabled={isAdding || !accountName.trim()}
          className="shrink-0 rounded-md border border-border-default px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          data-testid="ai-account-add"
        >
          {t("addAccount")}
        </button>
      </div>
      {errorKey ? (
        <p className="mt-1 text-[11px] text-status-error">{t(`errors.${errorKey}`)}</p>
      ) : null}
    </div>
  );
}

export default function AiAccountsRoute() {
  const t = useTranslations("aiAccounts");
  const [accounts, setAccounts] = useState<AiAccountSummary[] | null>(() => cachedAccounts);
  const [activeLogin, setActiveLogin] = useState<ActiveLoginSession | null>(null);
  const tc = useTranslations("common");
  const [loadFailed, setLoadFailed] = useState(false);
  const [operationFailed, setOperationFailed] = useState(false);
  const loginDialogRef = useRef<HTMLDialogElement>(null);

  const mountedRef = useRef(false);
  const loadIdRef = useRef(0);
  const loadAccounts = useCallback(async (force = false) => {
    const loadId = ++loadIdRef.current;
    try {
      const nextAccounts = await readAccounts(force);
      if (mountedRef.current && loadId === loadIdRef.current) {
        setAccounts(nextAccounts);
        setLoadFailed(false);
      }
    } catch (error) {
      console.error("Failed to load AI accounts:", error);
      if (mountedRef.current && loadId === loadIdRef.current) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    document.title = t("title");
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadAccounts();
    return () => { mountedRef.current = false; };
  }, [loadAccounts]);

  useEffect(() => {
    if (activeLogin) {
      loginDialogRef.current?.showModal();
    }
  }, [activeLogin]);

  const finishLogin = useCallback(() => {
    setActiveLogin(null);
    invalidateAiUsage();
    void loadAccounts(true);
  }, [loadAccounts]);

  async function removeAccount(account: AiAccountSummary) {
    if (!window.confirm(t("removeConfirm", { label: account.label }))) {
      return;
    }

    setOperationFailed(false);
    try { await removeAiAccount(account.provider, account.accountRoot); invalidateAiUsage(); await loadAccounts(true); }
    catch { setOperationFailed(true); }
  }

  return (
    <div className="w-full" data-testid="ai-accounts-route">
      <div className="space-y-6">
        {loadFailed && <LoadError inline onRetry={() => { void loadAccounts(true); }} />}
        {operationFailed && <p role="alert" className="text-sm text-status-error">{t("errors.operationFailed")}</p>}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t("title")}</h1>
            <p className="mt-1 text-sm text-text-secondary">{t("description")}</p>
          </div>
        </div>

        {activeLogin ? (
          <dialog
            ref={loginDialogRef}
            aria-labelledby="ai-account-login-title"
            aria-describedby="ai-account-login-hint"
            className="fixed inset-0 m-auto h-[min(640px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-border-default bg-bg-surface p-3 backdrop:bg-black/50 open:flex sm:p-5"
            // Escape belongs to the CLI; only the Close button should end sign-in.
            onCancel={(event) => event.preventDefault()}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <h2 id="ai-account-login-title" className="text-sm font-semibold text-text-primary">{t("loginInProgress")}</h2>
              <button
                type="button"
                onClick={finishLogin}
                className="rounded-md border border-border-default px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                data-testid="ai-account-login-close"
              >
                {t("closeLogin")}
              </button>
            </div>
            <p id="ai-account-login-hint" className="mb-3 shrink-0 text-xs text-text-muted">{t("loginHint")}</p>
            <Suspense fallback={<p className="text-sm text-text-muted">{tc("loading")}</p>}>
              <AiAccountLoginTerminal
                provider={activeLogin.provider}
                accountRoot={activeLogin.accountRoot}
                onExit={finishLogin}
              />
            </Suspense>
          </dialog>
        ) : null}

        <section className="rounded-xl border border-border-default bg-bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("usageSection")}</h2>
          {/* 구독과 남은 사용량을 한 화면에서 보려면 사용량 패널을 그대로 세우는 편이 낫다 */}
          <AiUsagePanel isOpen layout="grid" />
        </section>

        {!accounts && !loadFailed && <p role="status" className="text-sm text-text-muted">{tc("loading")}</p>}
        <div className="grid items-start gap-4 xl:grid-cols-3">
          {accounts && groupAccountsByProvider(accounts).map((group) => (
            <section
              key={group.provider}
              className="rounded-xl border border-border-default bg-bg-surface p-5"
              data-testid={`ai-accounts-provider-${group.provider}`}
            >
              <header className="mb-3 flex items-center gap-2">
                <AiProviderIcon provider={group.provider} size={16} />
                <h2 className="text-sm font-semibold capitalize text-text-primary">
                  {group.provider}
                </h2>
              </header>

              {group.accounts.length === 0 ? (
                <p className="text-xs text-text-muted">{t("noAccounts")}</p>
              ) : (
                <div className="space-y-2">
                  {group.accounts.map((account) => (
                    <AccountRow
                      key={account.accountRoot}
                      account={account}
                      isLoginOpen={activeLogin?.accountRoot === account.accountRoot}
                      onLogin={() => {
                        if (account.provider === "antigravity" && account.isLoggedIn) {
                          invalidateAiUsage();
                          void loadAccounts(true);
                        } else {
                          setActiveLogin({ provider: account.provider, accountRoot: account.accountRoot });
                        }
                      }}
                      onRemove={() => void removeAccount(account)}
                    />
                  ))}
                </div>
              )}

              {group.provider !== "antigravity" && <AddAccountForm
                provider={group.provider}
                onAdded={(accountRoot) => {
                  invalidateAiUsage();
                  void loadAccounts(true);
                  setActiveLogin({ provider: group.provider, accountRoot });
                }}
              />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
