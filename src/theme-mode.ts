import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'verdant.theme';

function savedTheme(): ThemeMode | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch { return null; }
}

/** Starts in Verdant's dark theme and respects saved choices across tabs. */
export function useThemeMode(): { theme: ThemeMode; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeMode>(() => savedTheme() || 'dark');
  const currentTheme = useRef(theme);
  currentTheme.current = theme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme.current === 'dark' ? 'light' : 'dark';
    currentTheme.current = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the choice for this open session. */ }
  }, []);

  useEffect(() => {
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      const saved = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
      setTheme(saved || 'dark');
    };
    window.addEventListener('storage', storageChanged);
    return () => window.removeEventListener('storage', storageChanged);
  }, []);

  return { theme, toggleTheme };
}
