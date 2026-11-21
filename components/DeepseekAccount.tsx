import { CircleAlert, ExternalLink, FlaskConical, LogIn, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccountError,
  cancelLogin,
  claimBonuses,
  fetchBonuses,
  fetchWallets,
  formatYuan,
  getLoginAttempt,
  revokeToken,
  startLogin,
  TOP_UP_URL,
  type Bonus,
  type DeepseekAccount,
  type LoginAttempt,
  type Wallets,
} from '@/lib/deepseek/account';
import type { Settings } from '@/lib/storage/settings';
import { Group, Row } from './SettingsUi';

type LlmSettings = Settings['llm'];

/** The login waiting for the browser, if any; follows other extension pages. */
export function useLoginAttempt(): LoginAttempt | undefined {
  const [attempt, setAttempt] = useState<LoginAttempt>();
  useEffect(() => {
    const refresh = () => void getLoginAttempt().then(setAttempt);
    refresh();
    const onChanged = (_changes: unknown, area: string) => {
      if (area === 'session') refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return attempt;
}

/** Starts a login, reporting a failure to start (the platform refused, no network). */
function useStartLogin() {
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const start = () => {
    setError(undefined);
    setStarting(true);
    void startLogin()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setStarting(false));
  };
  return { start, starting, error };
}

/** The "Account" row of the model form: a sign-in button, then the wait for the browser. */
export function AccountLoginRow({ account }: { account?: DeepseekAccount }) {
  const { t } = useTranslation();
  const attempt = useLoginAttempt();
  const { start, starting, error } = useStartLogin();

  if (attempt) return <WaitingRow attempt={attempt} />;
  return (
    <>
      <Row group label={t('account.account')}>
        {account?.token ? (
          <span className="truncate text-fg-muted">{account.email ?? account.phone ?? t('account.signedIn')}</span>
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={start}
            className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
          >
            {t('account.signIn')}
          </button>
        )}
      </Row>
      {error && <div className="px-4 py-2.5 text-xs text-red-500">{error}</div>}
    </>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 animate-spin text-accent" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function WaitingRow({ attempt }: { attempt: LoginAttempt }) {
  const { t } = useTranslation();
  return (
    <div data-testid="login-waiting" className="flex items-center gap-3 px-4 py-3 text-sm">
      <Spinner />
      <div className="min-w-0 flex-1">
        <div className="text-fg">{t('account.waiting')}</div>
        <button
          type="button"
          onClick={() => void browser.tabs.create({ url: attempt.authorizeUrl })}
          className="text-xs text-fg-muted hover:text-fg"
        >
          {t('account.reopen')} <ExternalLink className="inline size-3" />
        </button>
      </div>
      <button type="button" onClick={() => void cancelLogin()} className="text-[13px] text-fg-muted hover:text-fg">
        {t('common.cancel')}
      </button>
    </div>
  );
}

/** The signed-in (or expired) account in settings: who, balances and bonuses, top-up and sign-out. */
export function AccountCard({ llm, onChange }: { llm: LlmSettings; onChange: (llm: LlmSettings) => void }) {
  const { t } = useTranslation();
  const account = llm.deepseekAccount!;
  const token = account.token;
  const attempt = useLoginAttempt();
  const { start, starting, error: startError } = useStartLogin();
  const [wallets, setWallets] = useState<Wallets>();
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [claimed, setClaimed] = useState<Bonus[]>();
  const [claiming, setClaiming] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [error, setError] = useState<string>();

  const expire = () => onChange({ ...llm, deepseekAccount: { ...account, token: undefined } });
  const fail = (e: unknown) => {
    if (e instanceof AccountError && e.code === 'unauthorized') expire();
    else setError(e instanceof Error ? e.message : String(e));
  };

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetchWallets(token, controller.signal).then(setWallets, fail);
    void fetchBonuses(token, controller.signal).then(setBonuses, () => {});
    return () => controller.abort();
  }, [token]);

  const claim = () => {
    setClaiming(true);
    void claimBonuses(token!, bonuses)
      .then(async () => {
        setClaimed(bonuses);
        setBonuses([]);
        setWallets(await fetchWallets(token!));
      }, fail)
      .finally(() => setClaiming(false));
  };

  const signOut = () => {
    void revokeToken(token ?? '');
    onChange({ ...llm, deepseekAccount: undefined });
  };

  const pending = bonuses.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const expiry = (claimed ?? bonuses).map((b) => b.expiresAt).filter(Boolean).sort()[0];
  const contact = account.email ?? account.phone;

  return (
    <Group title={t('account.title')} footer={!token ? t('account.expiredNote') : undefined}>
      <div data-testid="account-card" className="flex items-center gap-3 px-4 py-3">
        {token ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
            {(account.name || contact || '?').charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warn/12 text-warn">
            <CircleAlert className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0 flex-1 text-sm leading-tight">
          <div className="truncate text-fg">{token ? contact ?? account.name : t('account.expired')}</div>
          <div className="mt-0.5 truncate text-xs text-fg-muted">{token ? account.email && account.phone : contact}</div>
        </div>
        {token ? (
          <span
            title={t('account.experimentalNote')}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warn/25 px-2 py-0.5 text-[11px] font-medium text-warn"
          >
            <FlaskConical className="size-3" />
            {t('account.experimental')}
          </span>
        ) : attempt ? (
          <Spinner />
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={start}
            className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {t('account.signInAgain')}
          </button>
        )}
      </div>
      {attempt && !token && <WaitingRow attempt={attempt} />}
      {token && (
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="px-4 py-3">
            <div className="text-xs text-fg-muted">{t('account.balance')}</div>
            <div data-testid="account-balance" className="mt-0.5 text-lg font-semibold tabular-nums">
              {wallets ? formatYuan(wallets.balance) : '…'}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-fg-muted">{t('account.bonus')}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{wallets ? formatYuan(wallets.bonus) : '…'}</div>
            {pending > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="text-fg-muted">{t('account.bonusPending', { amount: formatYuan(String(pending)) })}</span>
                <button type="button" disabled={claiming} onClick={claim} className="font-medium text-accent disabled:opacity-50">
                  {t('account.claim')}
                </button>
              </div>
            )}
            {claimed && (
              <div className="mt-1 text-xs text-fg-muted">
                {expiry ? t('account.claimedUntil', { date: new Date(expiry).toLocaleDateString() }) : t('account.claimed')}
              </div>
            )}
          </div>
        </div>
      )}
      {confirmingSignOut ? (
        <div className="space-y-3 bg-red-500/[.04] px-4 py-3 text-sm">
          <div className="text-fg">{t('account.signOutTitle')}</div>
          <div className="text-xs leading-relaxed text-fg-muted">{t('account.signOutNote')}</div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmingSignOut(false)} className="rounded-full bg-surface-raised px-3 py-1 text-[13px] hover:bg-fill-hover">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={signOut} className="rounded-full bg-red-500 px-3 py-1 text-[13px] font-medium text-white">
              {t('account.signOut')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
          {token ? (
            <a href={TOP_UP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              {t('account.topUp')}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setConfirmingSignOut(true)}
            className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
          >
            <LogOut className="size-3.5" />
            {t('account.signOut')}
          </button>
        </div>
      )}
      {(error || startError) && <div className="px-4 py-2.5 text-xs text-red-500">{error ?? startError}</div>}
    </Group>
  );
}

/** Under an answer that failed because the account login expired. */
export function SignInAgainButton() {
  const { t } = useTranslation();
  const attempt = useLoginAttempt();
  const { start, starting } = useStartLogin();
  return (
    <button
      type="button"
      disabled={starting || !!attempt}
      onClick={start}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-3.5 py-1.5 text-sm text-fg transition-colors hover:bg-fill-hover disabled:opacity-60"
    >
      {attempt ? <Spinner /> : <LogIn className="size-4" strokeWidth={1.75} />}
      {attempt ? t('account.waiting') : t('account.signInAgain')}
    </button>
  );
}
