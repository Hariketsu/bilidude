import { Check, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { AccountError, completeLogin, fetchWallets, formatYuan, type DeepseekAccount } from '@/lib/deepseekAccount';
import { applyUiLanguage } from '@/lib/i18n';
import { loadSettings, saveSettings } from '@/lib/settings';
import { applyTheme } from '@/lib/theme';
import '../sidepanel/style.css';

const CLOSE_AFTER_MS = 3000;

type Outcome = { status: 'working' } | { status: 'done'; account: DeepseekAccount; balance?: string } | { status: 'failed'; reason: string; detail: string };

/** Where DeepSeek's authorization comes back to (redirected from the loopback callback): saves the account and closes. */
function CallbackPage() {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<Outcome>({ status: 'working' });
  const started = useRef(false);

  useEffect(() => {
    // The code can be traded once; StrictMode runs effects twice in development.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    // The code is single use; don't leave it in the address bar or history.
    history.replaceState(null, '', location.pathname);
    void (async () => {
      try {
        const account = await completeLogin(params);
        const settings = await loadSettings();
        await saveSettings({ ...settings, llm: { ...settings.llm, deepseekAccount: account, deepseekAuth: 'account' } });
        const wallets = await fetchWallets(account.token!).catch(() => undefined);
        setOutcome({ status: 'done', account, balance: wallets?.balance });
        setTimeout(() => void browser.tabs.getCurrent().then((tab) => { if (tab?.id) void browser.tabs.remove(tab.id); }), CLOSE_AFTER_MS);
      } catch (error) {
        const code = error instanceof AccountError ? error.code : undefined;
        setOutcome({
          status: 'failed',
          reason: t(code === 'state' ? 'account.callback.stale' : 'account.callback.failed'),
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, []);

  const close = () => void browser.tabs.getCurrent().then((tab) => { if (tab?.id) void browser.tabs.remove(tab.id); });
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-10 text-center text-fg">
      {outcome.status === 'working' && <p className="shimmer-text text-[15px]">{t('account.callback.working')}</p>}
      {outcome.status === 'done' && (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-green-600/12 text-green-600">
            <Check className="size-6" strokeWidth={2.25} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">{t('account.callback.done')}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {[outcome.account.email ?? outcome.account.phone, outcome.balance && t('account.balanceShort', { amount: formatYuan(outcome.balance) })]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-5 text-sm text-fg-muted">{t('account.callback.closing')}</p>
        </>
      )}
      {outcome.status === 'failed' && (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <X className="size-6" strokeWidth={2.25} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">{t('account.callback.failedTitle')}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{outcome.reason}</p>
          <p className="mt-3 max-w-md text-xs break-words text-fg-muted/80">{outcome.detail}</p>
        </>
      )}
      {outcome.status !== 'working' && (
        <button type="button" onClick={close} className="mt-5 rounded-full bg-surface-raised px-4 py-1.5 text-sm hover:bg-fill-hover">
          {t('account.callback.close')}
        </button>
      )}
    </main>
  );
}

void loadSettings().then((settings) => {
  applyTheme(settings.theme);
  applyUiLanguage(settings.uiLanguage);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <CallbackPage />
    </React.StrictMode>,
  );
});
