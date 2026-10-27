/**
 * Theme handling (light / dark) without a flash of the wrong theme.
 *
 * THEME_INIT_SCRIPT runs inline in <head> before first paint: it applies the stored choice,
 * or falls back to the OS preference. The toggle then flips `data-theme` on <html>.
 */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tel-theme';

export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this session.
  }
}
