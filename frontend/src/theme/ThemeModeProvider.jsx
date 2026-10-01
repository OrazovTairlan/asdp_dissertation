import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { createAppTheme } from './createAppTheme';
import { DEFAULT_PALETTE, MODES, PALETTES } from './palettes';

const MODE_KEY = 'kpi-theme-mode';
const PALETTE_KEY = 'kpi-theme-palette';

const ThemeModeContext = createContext(null);

function read(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

export function ThemeModeProvider({ children }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState(() => read(MODE_KEY, 'system', MODES));
  const [paletteKey, setPaletteState] = useState(() => read(PALETTE_KEY, DEFAULT_PALETTE, Object.keys(PALETTES)));

  const resolvedMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => createAppTheme(paletteKey, resolvedMode), [paletteKey, resolvedMode]);

  const setMode = useCallback((m) => {
    if (!MODES.includes(m)) return;
    setModeState(m);
    write(MODE_KEY, m);
  }, []);
  const setPalette = useCallback((p) => {
    if (!PALETTES[p]) return;
    setPaletteState(p);
    write(PALETTE_KEY, p);
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedMode;
    document.documentElement.dataset.theme = resolvedMode;
  }, [resolvedMode]);

  const value = useMemo(
    () => ({ mode, setMode, paletteKey, setPalette, resolvedMode }),
    [mode, setMode, paletteKey, setPalette, resolvedMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode должен вызываться внутри <ThemeModeProvider>');
  return ctx;
}
