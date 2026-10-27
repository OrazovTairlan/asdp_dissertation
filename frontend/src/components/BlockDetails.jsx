import { useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import GavelIcon from '@mui/icons-material/Gavel';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import ConditionList from './ConditionList';
import { LevelBar, PubStatusChip } from './PublicationCheck';
import { COVERAGE_STATUS, IMAGE_LEVEL, kpiColor, matchVerdict, splitHighlight, truncate } from '../utils/format';

function Quote({ text, source, highlight }) {
  const [before, mark, after] = splitHighlight(text, highlight);
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5, my: 1 }}>
      <Typography variant="body2">
        «{before}
        {mark && (
          <Box component="mark" sx={{ bgcolor: 'warning.light', color: 'text.primary', px: 0.25, borderRadius: 0.5 }}>
            {mark}
          </Box>
        )}
        {after}»
      </Typography>
      {source && (
        <Typography variant="caption" color="text.secondary">
          {source}
        </Typography>
      )}
    </Box>
  );
}

function Argument({ match }) {
  const text = match.argument || match.reasoning;
  if (!text) return null;
  const counted = match.counted;
  const overridden = !counted && match.argument_overridden;
  const heading = counted
    ? 'Почему засчитано'
    : overridden
      ? 'Решение модели скорректировано программой'
      : match.verdict === 'needs_review'
        ? 'Аргумент модели по тексту отчёта'
        : 'Почему не засчитано';
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.25, mt: 1, borderColor: counted ? 'success.main' : 'warning.main', bgcolor: 'action.hover' }}
      data-testid="model-argument"
    >
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }}>
        <GavelIcon fontSize="small" color={counted ? 'success' : 'warning'} />
        <Typography variant="subtitle2">{heading}</Typography>
      </Stack>
      <Typography variant="body2">{text}</Typography>
      {overridden && (
        <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
          Модель отметила условия как подтверждённые, но программа их не приняла (цитаты нет в отчёте или пояснение модели противоречит отметке) — решение принял код, см. пометки «Программа» ниже.
        </Typography>
      )}
      {match.claim_quote && match.claim_verified === false && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Фрагмент, на который сослалась модель, не найден дословно — показана цитата достижения.
        </Typography>
      )}
    </Paper>
  );
}

function PublicationBadge({ check }) {
  if (!check) return null;
  return (
    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
      <ManageSearchIcon fontSize="small" color="action" />
      <Typography variant="caption">Публикация в открытых базах:</Typography>
      <PubStatusChip check={check} />
      <LevelBar level={check.level ?? 0} failed={check.status === 'conflict' || check.status === 'not_found'} />
      <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%' }}>
        {truncate(check.summary, 220)}
      </Typography>
    </Stack>
  );
}

const STEP_ICON = {
  ok: <CheckCircleIcon color="success" fontSize="small" titleAccess="пройдено" />,
  fail: <CancelIcon color="error" fontSize="small" titleAccess="не пройдено" />,
  warn: <WarningAmberIcon color="warning" fontSize="small" titleAccess="требует внимания" />,
  info: <InfoOutlinedIcon color="info" fontSize="small" titleAccess="сведения" />,
};

function Trace({ steps }) {
  if (!steps?.length) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="overline" color="text.secondary">
        Как принято решение
      </Typography>
      <Stack component="ol" gap={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Протокол решения">
        {steps.map((st, k) => (
          <Stack key={`${st.title}-${k}`} component="li" direction="row" gap={1} alignItems="flex-start" data-status={st.status}>
            <Box sx={{ mt: 0.25 }}>{STEP_ICON[st.status] ?? STEP_ICON.info}</Box>
            <Typography variant="body2" sx={{ minWidth: 0 }}>
              <b>{st.title}.</b> {st.text}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function ToCount({ items }) {
  if (!items?.length) return null;
  return (
    <Alert severity="info" icon={false} sx={{ mt: 1.5 }} data-testid="to-count">
      <b>Что нужно для зачёта:</b>
      <Box component="ul" sx={{ m: 0, pl: 2 }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </Box>
    </Alert>
  );
}

function MatchCard({ match, items, onAsk }) {
  const verdict = matchVerdict(match);
  const indicator = items.find((i) => i.id === match.indicator_id);
  const hasTrace = (match.trace ?? []).length > 0;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <Chip size="small" color={verdict.color} label={verdict.label} />
        <Typography variant="subtitle2">Показатель {match.indicator_num}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {match.achievement_id}
        </Typography>
        {onAsk && (
          <Button
            size="small"
            startIcon={<QuestionAnswerIcon />}
            onClick={() =>
              onAsk({
                question: `Почему достижение ${match.achievement_id} по показателю ${match.indicator_num} ${match.counted ? 'засчитано' : 'не засчитано'}?`,
                focus: { achievement_id: match.achievement_id, indicator_id: match.indicator_id },
              })
            }
          >
            Спросить модель
          </Button>
        )}
      </Stack>
      {indicator && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          {truncate(indicator.text, 240)}
        </Typography>
      )}
      <Quote text={match.quote} source={match.source} highlight={match.claim_quote} />
      <Argument match={match} />
      {(match.conditions ?? []).length > 0 && (
        <Typography variant="overline" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Проверка по условиям показателя
        </Typography>
      )}
      <ConditionList conditions={match.conditions} />
      {(match.evidence ?? []).map((e) => (
        <Chip
          key={e.image_id}
          size="small"
          variant="outlined"
          icon={<AttachFileIcon />}
          color={IMAGE_LEVEL[e.level]?.color ?? 'default'}
          label={`${e.filename}: ${IMAGE_LEVEL[e.level]?.label ?? e.level}`}
          sx={{ mr: 0.5, mt: 0.5 }}
        />
      ))}
      <PublicationBadge check={match.publication_check} />
      {(match.second_opinion ?? []).length > 0 && (
        <Alert severity="info" sx={{ mt: 1 }}>
          <b>Второе мнение модели:</b>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {match.second_opinion.map((o) => (
              <li key={`${o.condition}-${o.explanation}`}>
                {o.condition && <i>{o.condition}: </i>}
                {o.explanation}
              </li>
            ))}
          </Box>
        </Alert>
      )}
      <Trace steps={match.trace} />
      <ToCount items={match.to_count} />
      {!hasTrace && match.missing_conditions && (
        <Alert severity={match.verdict === 'needs_review' ? 'error' : 'warning'} sx={{ mt: 1 }} icon={false}>
          <b>{match.verdict === 'needs_review' ? 'Требует проверки:' : 'Не хватает:'}</b> {match.missing_conditions}
        </Alert>
      )}
    </Paper>
  );
}

function Coverage({ rows }) {
  const [showSilent, setShowSilent] = useState(false);
  if (!rows?.length) return null;
  const silent = rows.filter((r) => r.status === 'not_claimed');
  const visible = showSilent ? rows : rows.filter((r) => r.status !== 'not_claimed');
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary">
        Показатели блока
      </Typography>
      <Stack component="ul" gap={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Показатели блока">
        {visible.map((r) => {
          const st = COVERAGE_STATUS[r.status] ?? { label: r.status, color: 'default' };
          return (
            <Stack key={r.indicator_id} component="li" direction={{ xs: 'column', sm: 'row' }} gap={{ xs: 0.5, sm: 1.5 }} alignItems={{ sm: 'flex-start' }}>
              <Chip size="small" color={st.color} variant={st.color === 'default' ? 'outlined' : 'filled'} label={st.label} sx={{ minWidth: 118, alignSelf: 'flex-start' }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2">
                  <b>{r.num}.</b> {truncate(r.text, 200)}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {truncate(r.argument, 360)}
                </Typography>
                {(r.checklist ?? []).length > 0 && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ opacity: 0.85 }}>
                    Условия: {r.checklist.join(' · ')}
                  </Typography>
                )}
              </Box>
            </Stack>
          );
        })}
      </Stack>
      {silent.length > 0 && (
        <Button size="small" color="inherit" onClick={() => setShowSilent((v) => !v)} sx={{ mt: 0.5, px: 0.5, color: 'text.secondary', textTransform: 'none' }}>
          {showSilent
            ? 'Скрыть показатели без заявлений'
            : `Нет заявлений по ${silent.length} показател${silent.length === 1 ? 'ю' : 'ям'}: ${truncate(silent.map((r) => r.num).join(', '), 60)}`}
        </Button>
      )}
    </Box>
  );
}

export default function BlockDetails({ block, defaultExpanded, onAsk }) {
  const hasContent = block.matches.length > 0 || block.metrics.length > 0;
  return (
    <Accordion defaultExpanded={defaultExpanded ?? hasContent}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ width: '100%', pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="subtitle1">{block.title}</Typography>
            {block.summary && (
              <Typography variant="caption" color="text.secondary">
                {block.summary}
              </Typography>
            )}
          </Box>
          <Chip size="small" variant="outlined" label={`вес ${block.weight}%`} />
          <Chip size="small" color={kpiColor(block.fulfillment)} label={`${block.fulfillment}%`} />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Coverage rows={block.coverage} />
        {block.matches.map((m) => (
          <MatchCard key={`${m.achievement_id}-${m.indicator_id}`} match={m} items={block.items} onAsk={onAsk} />
        ))}
        {block.metrics.map((m) => (
          <Paper key={m.indicator_id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Stack direction="row" gap={1} alignItems="center">
              <Chip size="small" color="success" label="Значение найдено" />
              <Typography variant="subtitle2">
                Показатель {m.indicator_num}: {m.value}%
              </Typography>
            </Stack>
            <Quote text={m.quote} source={m.source} />
          </Paper>
        ))}
        {!hasContent && !block.coverage?.length && (
          <Typography variant="body2" color="text.secondary">
            Подтверждённых достижений по этому блоку не найдено.
          </Typography>
        )}
        {block.notes.map((n) => (
          <Alert key={n} severity="info" sx={{ mt: 1 }}>
            {n}
          </Alert>
        ))}
        {block.rejected.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Отброшено проверкой цитат: {block.rejected.length} ({truncate(block.rejected.map((r) => r.reason).join('; '), 200)})
          </Alert>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
