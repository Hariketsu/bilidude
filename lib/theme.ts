export type ThemePreference = 'system' | 'light' | 'dark';

const media = window.matchMedia('(prefers-color-scheme: dark)');
let stopFollowingSystem: (() => void) | undefined;

/** Toggles the `dark` class on <html>; `system` keeps tracking the OS setting. */
export function applyTheme(preference: ThemePreference) {
  stopFollowingSystem?.();
  stopFollowingSystem = undefined;

  const root = document.documentElement;
  if (preference !== 'system') {
    root.classList.toggle('dark', preference === 'dark');
    return;
  }

  const sync = () => root.classList.toggle('dark', media.matches);
  sync();
  media.addEventListener('change', sync);
  stopFollowingSystem = () => media.removeEventListener('change', sync);
}
