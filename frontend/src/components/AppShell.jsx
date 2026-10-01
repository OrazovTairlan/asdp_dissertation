import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HistoryIcon from '@mui/icons-material/History';
import GavelIcon from '@mui/icons-material/Gavel';
import InsightsIcon from '@mui/icons-material/Insights';
import ThemeSwitcher from '../theme/ThemeSwitcher';
import { useHealth } from '../hooks/useApi';

const DRAWER_WIDTH = 248;

const NAV_ITEMS = [
  { to: '/', label: 'Панель', icon: <DashboardIcon /> },
  { to: '/catalogs', label: 'База KPI организации', icon: <LibraryBooksIcon /> },
  { to: '/evaluate', label: 'Оценка отчёта', icon: <FactCheckIcon /> },
  { to: '/history', label: 'История оценок', icon: <HistoryIcon /> },
  { to: '/rules', label: 'Правила модели', icon: <GavelIcon /> },
];

function HealthChip() {
  const { data, error } = useHealth();
  let color = 'default';
  let label = 'Проверка…';
  let tip = '';
  if (error) {
    color = 'error';
    label = 'Сервер недоступен';
  } else if (data) {
    if (!data.reachable) {
      color = 'error';
      label = 'Ollama недоступна';
      tip = data.ollama_url;
    } else if (!data.text_model_ok) {
      color = 'warning';
      label = `${data.text_model}: не установлена`;
      tip = 'Выполните: ollama pull ' + data.text_model;
    } else {
      color = 'success';
      label = data.text_model;
      tip = `Ollama ✓ · зрение: ${data.vision_model} ${data.vision_model_ok ? '✓' : '(не установлена)'} · T=${data.settings.temperature}, top_k=${data.settings.top_k}, ctx=${data.settings.num_ctx}`;
    }
  }
  return (
    <Tooltip title={tip}>
      <Chip size="small" color={color} variant="filled" label={label} sx={{ maxWidth: { xs: 150, sm: 320 } }} data-testid="health-chip" />
    </Tooltip>
  );
}

function Brand() {
  return (
    <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'inherit', textDecoration: 'none' }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}>
        <InsightsIcon fontSize="small" />
      </Box>
      <Box>
        <Typography variant="subtitle1" sx={{ lineHeight: 1.1 }}>
          KPI Evaluator
        </Typography>
        <Typography variant="caption" color="text.secondary">
          NLP + Computer Vision
        </Typography>
      </Box>
    </Box>
  );
}

function NavList({ onNavigate }) {
  const { pathname } = useLocation();
  return (
    <List component="nav" aria-label="Основное меню" sx={{ px: 1.5 }}>
      {NAV_ITEMS.map((item) => {
        const selected = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
        return (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={selected}
            aria-current={selected ? 'page' : undefined}
            onClick={onNavigate}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: selected ? 'primary.main' : 'inherit' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: selected ? 650 : 500 } }} />
          </ListItemButton>
        );
      })}
    </List>
  );
}

export default function AppShell() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);

  const drawer = (
    <Box sx={{ pt: 2 }}>
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Brand />
      </Box>
      <NavList onNavigate={() => setOpen(false)} />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          ml: { md: `${DRAWER_WIDTH}px` },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {!desktop && (
            <IconButton edge="start" aria-label="Открыть меню" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          {!desktop && <Brand />}
          <Box sx={{ flex: 1 }} />
          <HealthChip />
          <ThemeSwitcher />
        </Toolbar>
      </AppBar>

      <Box component="aside" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={desktop ? 'permanent' : 'temporary'}
          open={desktop || open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' } }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 }, pt: { xs: 10, md: 11 } }}>
        <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
