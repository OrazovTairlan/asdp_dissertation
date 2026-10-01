import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ConditionList from './ConditionList';
import { IMAGE_LEVEL, kpiColor, matchVerdict, truncate } from '../utils/format';

function Quote({ text, source }) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5, my: 1 }}>
      <Typography variant="body2">«{text}»</Typography>
      {source && (
        <Typography variant="caption" color="text.secondary">
          {source}
        </Typography>
      )}
    </Box>
  );
}

function MatchCard({ match, items }) {
  const verdict = matchVerdict(match);
  const indicator = items.find((i) => i.id === match.indicator_id);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        <Chip size="small" color={verdict.color} label={verdict.label} />
        <Typography variant="subtitle2">Показатель {match.indicator_num}</Typography>
      </Stack>
      {indicator && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          {truncate(indicator.text, 240)}
        </Typography>
      )}
      <Quote text={match.quote} source={match.source} />
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
      {match.missing_conditions && (
        <Alert severity={match.verdict === 'needs_review' ? 'error' : 'warning'} sx={{ mt: 1 }} icon={false}>
          <b>Не хватает:</b> {match.missing_conditions}
        </Alert>
      )}
      {match.reasoning && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          {match.reasoning}
        </Typography>
      )}
    </Paper>
  );
}

export default function BlockDetails({ block, defaultExpanded }) {
  const hasContent = block.matches.length > 0 || block.metrics.length > 0;
  return (
    <Accordion defaultExpanded={defaultExpanded ?? hasContent}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ width: '100%', pr: 1 }}>
          <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 220 }}>
            {block.title}
          </Typography>
          <Chip size="small" variant="outlined" label={`вес ${block.weight}%`} />
          <Chip size="small" color={kpiColor(block.fulfillment)} label={`${block.fulfillment}%`} />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {block.matches.map((m) => (
          <MatchCard key={`${m.achievement_id}-${m.indicator_id}`} match={m} items={block.items} />
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
        {!hasContent && (
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
