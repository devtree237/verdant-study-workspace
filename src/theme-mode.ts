import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'verdant.theme';

function savedTheme(): ThemeMode | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch { return null; }
}

function systemTheme(): ThemeMode {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Follows the system until the user chooses; an explicit choice also works when
 * browser storage is unavailable. Other tabs stay in sync via the storage event. */
export function useThemeMode(): { theme: ThemeMode; toggleTheme: () => void } {
  const initial = useRef<{ preference: ThemeMode | null; theme: ThemeMode } | null>(null);
  if (!initial.current) {
    const preference = savedTheme();
    initial.current = { preference, theme: preference || systemTheme() };
  }
  const [theme, setTheme] = useState<ThemeMode>(initial.current.theme);
  const preference = useRef<ThemeMode | null>(initial.current.preference);
  const currentTheme = useRef(theme);
  currentTheme.current = theme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme.current === 'dark' ? 'light' : 'dark';
    currentTheme.current = next;
    preference.current = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the choice for this open session. */ }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemChanged = (event: MediaQueryListEvent) => {
      if (preference.current === null) setTheme(event.matches ? 'dark' : 'light');
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      const saved = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
      preference.current = saved;
      setTheme(saved || (media.matches ? 'dark' : 'light'));
    };
    media.addEventListener('change', systemChanged);
    window.addEventListener('storage', storageChanged);
    // A system change between render and effect should not leave the initial theme stale.
    if (preference.current === null) setTheme(media.matches ? 'dark' : 'light');
    return () => {
      media.removeEventListener('change', systemChanged);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);

  return { theme, toggleTheme };
}
