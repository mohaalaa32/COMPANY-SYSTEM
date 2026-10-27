'use client';

import { useSyncExternalStore } from 'react';
import { applyTheme, readTheme, type Theme } from '@/lib/theme';
import { IconMoon, IconSun } from './icons';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const serverSnapshot = (): Theme => 'light';

export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverSnapshot);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح';

  return (
    <button
      type="button"
      id="theme-toggle"
      className={className}
      onClick={() => applyTheme(next)}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}
