import { useEffect, useState } from 'react';
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
 * Asks for access to a custom endpoint's host. Settings save as they're typed, but
 * Chrome only grants host permissions during a click, so this offers a button.
 */
export function HostAccess({ baseUrl }: { baseUrl: string }) {
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
  if (!origin) return <Hint warning>Enter a valid base URL, e.g. https://api.example.com/v1</Hint>;
  if (granted === undefined) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <p className="flex-1 text-xs leading-relaxed text-fg-muted">bilidude needs access to {origin} to call this endpoint.</p>
      <button
        type="button"
        onClick={async () => setGranted(await browser.permissions.request({ origins: [`${origin}/*`] }))}
        className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
      >
        Allow access
      </button>
    </div>
  );
}
