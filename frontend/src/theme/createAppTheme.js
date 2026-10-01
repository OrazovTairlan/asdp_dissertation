import { alpha, createTheme } from '@mui/material/styles';
import { DEFAULT_PALETTE, PALETTES } from './palettes';

const FONT = '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function createAppTheme(paletteKey = DEFAULT_PALETTE, mode = 'light') {
  const preset = PALETTES[paletteKey] ?? PALETTES[DEFAULT_PALETTE];
  const dark = mode === 'dark';
  const primary = preset.primary[dark ? 'dark' : 'light'];
  const secondary = preset.secondary[dark ? 'dark' : 'light'];

  return createTheme({
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: secondary },
      success: { main: dark ? '#5fd4a4' : '#13795b' },
      warning: { main: dark ? '#ffb25e' : '#b54708' },
      error: { main: dark ? '#ff8a80' : '#b42318' },
      background: dark ? { default: '#0d1117', paper: '#151b26' } : { default: '#f4f6fb', paper: '#ffffff' },
      divider: dark ? alpha('#ffffff', 0.12) : alpha('#101828', 0.1),
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT,
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 650 },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: ({ theme }) => ({ borderColor: theme.palette.divider }) },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiTableCell: {
        styleOverrides: {
          head: ({ theme }) => ({ fontWeight: 650, color: theme.palette.text.secondary, whiteSpace: 'nowrap' }),
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            border: `1px solid ${theme.palette.divider}`,
            '&:not(:last-child)': { marginBottom: 8 },
            '&::before': { display: 'none' },
          }),
        },
      },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}
