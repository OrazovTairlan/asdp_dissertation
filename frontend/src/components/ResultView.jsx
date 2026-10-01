import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import VerifiedIcon from '@mui/icons-material/Verified';
import { api } from '../api';
import KpiGauge from './KpiGauge';
import BlockDetails from './BlockDetails';
import ImageCard from './ImageCard';
import ProcessingSteps from './ProcessingSteps';
import { clamp, kpiColor, truncate } from '../utils/format';

function RunConfig({ config }) {
  if (!config) return null;
  const rows = [
    ['Текстовая модель', config.text_model],
    ['Хэш весов модели', config.text_model_digest ? truncate(config.text_model_digest, 16) : 'недоступен'],
    ['Vision-модель', config.vision_model],
    ['Версия промптов', config.prompt_version],
    ['temperature / top_k / seed', `${config.temperature} / ${config.top_k} / ${config.seed}`],
    ['Контекст / рассуждение', `${config.num_ctx} / ${config.think ?? '—'}`],
    ['Кэш ответов', config.cache ? 'включён' : 'выключен'],
  ];
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" gap={1} alignItems="center">
          <VerifiedIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1">Воспроизводимость: параметры запуска</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Table size="small">
          <TableBody>
            {rows.map(([k, v]) => (
              <TableRow key={k}>
                <TableCell sx={{ width: 240, color: 'text.secondary' }}>{k}</TableCell>
                <TableCell sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{v}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AccordionDetails>
    </Accordion>
  );
}

function PositionPicker({ result, onRerun, busy }) {
  const [value, setValue] = useState(result.positions_available[0] ?? '');
  return (
    <Alert severity="warning" sx={{ alignItems: 'center' }}>
      <Typography sx={{ mb: 1 }}>Должность не определена по тексту отчёта. Выберите её вручную:</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
        <TextField select size="small" label="Должность" value={value} onChange={(e) => setValue(e.target.value)} sx={{ minWidth: 280 }}>
          {result.positions_available.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" disabled={busy || !value} onClick={() => onRerun({ positionName: value })}>
          Пересчитать
        </Button>
      </Stack>
    </Alert>
  );
}

export default function ResultView({ submission, onRerun, busy = false }) {
  const r = submission.result;
  const [scope, setScope] = useState(r?.scope?.index ?? 0);
  if (!r) return null;

  const warnings = r.warnings ?? [];
  const images = Object.values(r.images ?? {});

  return (
    <Stack gap={3}>
      {warnings.length > 0 && (
        <Alert severity="warning">
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </Box>
        </Alert>
      )}

      {r.status === 'needs_position' && <PositionPicker result={r} onRerun={onRerun} busy={busy} />}

      {r.status === 'done' && (
        <>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={3} alignItems="center">
                <Box textAlign="center">
                  <KpiGauge value={r.kpi_total_pct} />
                  <Typography variant="caption" color="text.secondary">
                    итоговое выполнение личного KPI (предварительно)
                  </Typography>
                </Box>
                <Stack gap={1} sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h5">{r.employee || 'Сотрудник'}</Typography>
                  <Typography color="text.secondary">
                    {r.position.name} <Typography component="span" variant="caption">({r.position.source})</Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Карта KPI: {r.scope.label}
                  </Typography>
                  {r.scope.options.length > 1 && (
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1.5 }}>
                      <TextField select size="small" label="Карта KPI" value={scope} onChange={(e) => setScope(Number(e.target.value))} sx={{ minWidth: 300, maxWidth: '100%' }}>
                        {r.scope.options.map((o, i) => (
                          <MenuItem key={o} value={i}>
                            {truncate(o, 90)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Button disabled={busy || scope === r.scope.index} onClick={() => onRerun({ positionKey: r.position.key, scopeIndex: scope })} startIcon={<RefreshIcon />}>
                        Применить
                      </Button>
                    </Stack>
                  )}
                  <Box>
                    <Button variant="outlined" startIcon={<DownloadIcon />} href={api.exportUrl(submission.id)}>
                      Excel: Лист исполнения
                    </Button>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <TableContainer>
              <Table aria-label="Итоги по блокам KPI">
                <TableHead>
                  <TableRow>
                    <TableCell>Блок KPI</TableCell>
                    <TableCell align="right">Вес</TableCell>
                    <TableCell>Цель</TableCell>
                    <TableCell align="right">Факт</TableCell>
                    <TableCell sx={{ width: 200 }}>Исполнение</TableCell>
                    <TableCell align="right">Вклад</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.blocks.map((b) => (
                    <TableRow key={b.id} hover>
                      <TableCell>{b.title}</TableCell>
                      <TableCell align="right">{b.weight}%</TableCell>
                      <TableCell>{b.target.raw}</TableCell>
                      <TableCell align="right">{b.achieved ?? '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" gap={1} alignItems="center">
                          <LinearProgress variant="determinate" value={clamp(b.fulfillment)} color={kpiColor(b.fulfillment)} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
                          <Typography variant="caption" sx={{ minWidth: 44, textAlign: 'right' }}>
                            {b.fulfillment}%
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <b>{b.contribution}%</b>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={5}>
                      <b>Итого</b> <Typography component="span" variant="caption" color="text.secondary">(сумма весов {r.weights_total}%)</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip color={kpiColor(r.kpi_total_pct)} label={`${r.kpi_total_pct}%`} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Box>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Обоснование по блокам
            </Typography>
            {r.blocks.map((b) => (
              <BlockDetails key={b.id} block={b} />
            ))}
          </Box>

          {(r.unmatched_achievements ?? []).length > 0 && (
            <Box>
              <Typography variant="h6">Достижения вне показателей</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Не подходят под критерии каталога этой должности — в KPI не учитываются.
              </Typography>
              {r.unmatched_achievements.map((a) => (
                <Box key={a.id} sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5, my: 1 }}>
                  <Typography variant="body2">«{a.quote}»</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {a.source}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {images.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Анализ изображений
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}>
            {images.map((img) => (
              <ImageCard key={img.id} submissionId={submission.id} image={img} />
            ))}
          </Box>
        </Box>
      )}

      <RunConfig config={r.run_config} />

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1">Ход обработки</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ProcessingSteps steps={submission.steps} />
        </AccordionDetails>
      </Accordion>

      <Typography variant="caption" color="text.secondary">
        {r.disclaimer}
      </Typography>
    </Stack>
  );
}
