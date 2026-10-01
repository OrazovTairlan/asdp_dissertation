import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import SpeedIcon from '@mui/icons-material/Speed';
import ShieldIcon from '@mui/icons-material/Shield';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { PageHeader, StatusChip } from '../components/common';
import { formatDate, kpiColor } from '../utils/format';

function Stat({ icon, label, value, loading }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" gap={2} alignItems="center">
          <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h5">{loading ? <Skeleton width={48} /> : value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const PRINCIPLES = [
  'Только показатели из документа организации',
  'Цитата-доказательство для каждого вывода',
  'Условия проверяются по одному, решает код',
  'temperature=0, top_k=1, фиксированный seed',
  'Проценты и итог считает код, не модель',
  'Повреждённые / «смонтированные» изображения не засчитываются',
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const health = useApi(api.health, []);
  const catalogs = useApi(api.listCatalogs, []);
  const subs = useApi(api.listSubmissions, []);

  const done = (subs.data ?? []).filter((s) => s.kpi != null);
  const avg = done.length ? Math.round((done.reduce((a, s) => a + s.kpi, 0) / done.length) * 10) / 10 : '—';
  const h = health.data;

  return (
    <>
      <PageHeader
        title="Панель"
        subtitle="Интеллектуальная система проверки KPI: разбирает документ организации, сопоставляет отчёт сотрудника с показателями и проверяет подтверждающие изображения."
        actions={
          <Button variant="contained" startIcon={<FactCheckIcon />} component={RouterLink} to="/evaluate">
            Оценить отчёт
          </Button>
        }
      />

      {h && !h.reachable && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Ollama недоступна по адресу <b>{h.ollama_url}</b>. Запустите Ollama и выполните <code>ollama pull {h.text_model}</code>.
        </Alert>
      )}
      {h?.reachable && !h.text_model_ok && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Модель <b>{h.text_model}</b> не установлена: <code>ollama pull {h.text_model}</code>
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, mb: 3 }}>
        <Stat icon={<LibraryBooksIcon />} label="Каталогов KPI" value={catalogs.data?.length ?? 0} loading={catalogs.loading} />
        <Stat icon={<FactCheckIcon />} label="Оценок выполнено" value={subs.data?.length ?? 0} loading={subs.loading} />
        <Stat icon={<SpeedIcon />} label="Средний KPI" value={avg === '—' ? avg : `${avg}%`} loading={subs.loading} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Последние оценки
            </Typography>
            {subs.loading ? (
              <Skeleton variant="rounded" height={120} />
            ) : (subs.data ?? []).length === 0 ? (
              <Typography color="text.secondary">Пока нет оценок. Загрузите каталог KPI и первый отчёт сотрудника.</Typography>
            ) : (
              <Table size="small" aria-label="Последние оценки">
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Сотрудник</TableCell>
                    <TableCell>Должность</TableCell>
                    <TableCell>KPI</TableCell>
                    <TableCell>Статус</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subs.data.slice(0, 6).map((s) => (
                    <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/submissions/${s.id}`)}>
                      <TableCell>{formatDate(s.created_at)}</TableCell>
                      <TableCell>{s.employee || '—'}</TableCell>
                      <TableCell>{s.position || '—'}</TableCell>
                      <TableCell>{s.kpi != null ? <Chip size="small" color={kpiColor(s.kpi)} label={`${s.kpi}%`} /> : '—'}</TableCell>
                      <TableCell>
                        <StatusChip status={s.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardActionArea component={RouterLink} to="/rules" sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1.5 }}>
                <ShieldIcon color="primary" />
                <Typography variant="h6">Строгий режим</Typography>
              </Stack>
              <Stack gap={0.75}>
                {PRINCIPLES.map((p) => (
                  <Typography key={p} variant="body2" color="text.secondary">
                    ✓ {p}
                  </Typography>
                ))}
              </Stack>
              {h && (
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip size="small" variant="outlined" label={`промпты v${h.prompt_version}`} />
                  <Chip size="small" variant="outlined" label={`T=${h.settings.temperature}`} />
                  <Chip size="small" variant="outlined" label={`top_k=${h.settings.top_k}`} />
                  <Chip size="small" variant="outlined" label={`ctx ${h.settings.num_ctx}`} />
                  <Chip size="small" variant="outlined" label={h.settings.llm_cache ? 'кэш: вкл' : 'кэш: выкл'} />
                </Stack>
              )}
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>
    </>
  );
}
