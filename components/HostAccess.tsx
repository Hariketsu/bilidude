import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '@/lib/i18n';
import { Hint } from './SettingsUi';

export function originOf(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Asks for a base URL's host and returns an error message, or undefined once granted.
 * Call it before any other await: Chrome only grants permissions during the click.
 */
export async function requestHostAccess(baseUrl: string): Promise<string | undefined> {
  const origin = originOf(baseUrl);
  if (!origin) return t('settings.host.invalidUrl');
  if (!(await browser.permissions.request({ origins: [`${origin}/*`] }))) return t('settings.host.needsAccess', { origin });
  return undefined;
}

/**
 * Asks for access to a custom endpoint's host. Settings save as they're typed, but
 * Chrome only grants host permissions during a click, so this offers a button.
 */
export function HostAccess({ baseUrl }: { baseUrl: string }) {
  const { t } = useTranslation();
  const origin = originOf(baseUrl);
  const [granted, setGranted] = useState<boolean>();

  useEffect(() => {
    setGranted(undefined);
    if (!origin) return;
    let current = true;
    void browser.permissions.contains({ origins: [`${origin}/*`] }).then((has) => current && setGranted(has));
    return () => {
      current = false;
    };
  }, [origin]);

  if (!baseUrl.trim() || granted) return null;
  if (!origin) return <Hint warning>{t('settings.host.invalidUrl')}</Hint>;
  if (granted === undefined) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <p className="flex-1 text-xs leading-relaxed text-fg-muted">{t('settings.host.needsAccess', { origin })}</p>
      <button
        type="button"
        onClick={async () => setGranted(await browser.permissions.request({ origins: [`${origin}/*`] }))}
        className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
      >
        {t('settings.host.allow')}
      </button>
    </div>
  );
}
