import { useState } from 'react';
import { Box, IconButton, Popover, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import CheckIcon from '@mui/icons-material/Check';
import { PALETTES } from './palettes';
import { useThemeMode } from './ThemeModeProvider';

export default function ThemeSwitcher() {
  const { mode, setMode, paletteKey, setPalette, resolvedMode } = useThemeMode();
  const [anchor, setAnchor] = useState(null);

  return (
    <>
      <Tooltip title="Тема оформления">
        <IconButton aria-label="Тема оформления" color="inherit" onClick={(e) => setAnchor(e.currentTarget)}>
          <PaletteIcon />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 300 }}>
          <Typography variant="overline" color="text.secondary">
            Режим
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={mode}
            onChange={(_, v) => v && setMode(v)}
            aria-label="Режим темы"
            sx={{ mb: 2, mt: 0.5 }}
          >
            <ToggleButton value="light" aria-label="Светлая">
              <LightModeIcon fontSize="small" sx={{ mr: 0.5 }} /> Светлая
            </ToggleButton>
            <ToggleButton value="dark" aria-label="Тёмная">
              <DarkModeIcon fontSize="small" sx={{ mr: 0.5 }} /> Тёмная
            </ToggleButton>
            <ToggleButton value="system" aria-label="Системная">
              <SettingsBrightnessIcon fontSize="small" sx={{ mr: 0.5 }} /> Авто
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="overline" color="text.secondary">
            Цветовая схема
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, mt: 0.5 }}>
            {Object.entries(PALETTES).map(([key, p]) => {
              const color = p.primary[resolvedMode === 'dark' ? 'dark' : 'light'];
              const selected = key === paletteKey;
              return (
                <Tooltip key={key} title={p.label}>
                  <IconButton
                    aria-label={`Палитра ${p.label}`}
                    aria-pressed={selected}
                    onClick={() => setPalette(key)}
                    sx={{
                      bgcolor: color,
                      color: '#fff',
                      width: 40,
                      height: 40,
                      border: 2,
                      borderColor: selected ? 'text.primary' : 'transparent',
                      '&:hover': { bgcolor: color, opacity: 0.85 },
                    }}
                  >
                    {selected && <CheckIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      </Popover>
    </>
  );
}
