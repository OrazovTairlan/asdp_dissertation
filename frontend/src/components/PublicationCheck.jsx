import { Alert, Box, Chip, Link, Paper, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { PUB_STATUS, identifierList, truncate } from '../utils/format';

export function PubStatusChip({ check, size = 'small' }) {
  const info = PUB_STATUS[check.status] ?? { label: check.status, color: 'default' };
  return <Chip size={size} color={info.color} variant={info.color === 'default' ? 'outlined' : 'filled'} label={info.label} />;
}

export function LevelBar({ level = 0, failed = false }) {
  return (
    <Stack direction="row" gap={0.5} alignItems="center" aria-label={`Уровень проверки ${level} из 4`} role="img">
      {[1, 2, 3, 4].map((n) => (
        <Box
          key={n}
          sx={{
            width: 22,
            height: 6,
            borderRadius: 3,
            bgcolor: n <= level ? (failed ? 'warning.main' : 'success.main') : 'action.disabledBackground',
          }}
        />
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
        {level}/4
      </Typography>
    </Stack>
  );
}

function StepIcon({ step, reached }) {
  if (step.ok) return <CheckCircleIcon color="success" fontSize="small" titleAccess="Уровень пройден" />;
  if (reached) return <CancelIcon color="error" fontSize="small" titleAccess="Уровень не пройден" />;
  return <RadioButtonUncheckedIcon color="disabled" fontSize="small" titleAccess="Уровень не проверялся" />;
}

function Steps({ steps, level }) {
  return (
    <Stack component="ol" gap={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Уровни проверки публикации">
      {steps.map((s) => (
        <Stack key={s.level} component="li" direction="row" gap={1} alignItems="flex-start">
          <Box sx={{ mt: 0.25 }}>
            <StepIcon step={s} reached={s.level === level + 1} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2">
              {s.level}. {s.title}
            </Typography>
            {s.detail && (
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {s.detail}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

function ExtLink({ href, children }) {
  if (!href) return children;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ wordBreak: 'break-word' }}>
      {children}
      <OpenInNewIcon sx={{ fontSize: 12, ml: 0.25, verticalAlign: 'middle' }} />
    </Link>
  );
}

function Identifiers({ ids }) {
  const list = identifierList(ids);
  if (!list.length) return null;
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap">
      {list.map((i) => (
        <Chip
          key={`${i.kind}-${i.value}`}
          size="small"
          variant="outlined"
          component={i.href ? 'a' : 'div'}
          href={i.href ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          clickable={Boolean(i.href)}
          label={`${i.kind.toUpperCase()} ${truncate(i.value, 48)}`}
        />
      ))}
    </Stack>
  );
}

function RecordCard({ rec }) {
  const authors = (rec.authors ?? []).map((a) => a.name).filter(Boolean);
  const meta = [rec.venue, rec.year, rec.type, rec.publisher].filter(Boolean).join(' · ');
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
        {(rec.sources ?? [rec.source]).map((s) => (
          <Chip key={s} size="small" label={s} />
        ))}
        {rec.retracted && <Chip size="small" color="error" label="Отозвана" />}
        {rec.cited_by != null && (
          <Typography variant="caption" color="text.secondary">
            цитирований: {rec.cited_by}
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" fontWeight={600}>
        <ExtLink href={rec.url}>{rec.title || 'Без названия'}</ExtLink>
      </Typography>
      {meta && (
        <Typography variant="caption" color="text.secondary" display="block">
          {meta}
        </Typography>
      )}
      {authors.length > 0 && (
        <Typography variant="caption" display="block">
          Авторы: {authors.slice(0, 8).join(', ')}
          {authors.length > 8 ? ` и ещё ${authors.length - 8}` : ''}
        </Typography>
      )}
      {(rec.institutions ?? []).length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block">
          Организации: {rec.institutions.slice(0, 4).join(', ')}
        </Typography>
      )}
      {rec.found_via && (
        <Typography variant="caption" color="text.secondary" display="block">
          Найдено через {rec.found_via}
        </Typography>
      )}
    </Paper>
  );
}

export default function PublicationCheck({ check, title }) {
  const failed = check.status === 'conflict' || check.status === 'not_found';
  const flags = check.flags ?? [];
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="publication-check">
      <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
        <PubStatusChip check={check} />
        <LevelBar level={check.level ?? 0} failed={failed} />
        {title && (
          <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 200 }}>
            {title}
          </Typography>
        )}
      </Stack>
      {check.quote && (
        <Box sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5, mb: 1 }}>
          <Typography variant="body2">«{truncate(check.quote, 400)}»</Typography>
          {check.source && (
            <Typography variant="caption" color="text.secondary">
              {check.source}
            </Typography>
          )}
        </Box>
      )}
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {check.summary}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.2fr)' } }}>
        <Stack gap={1.5}>
          {(check.steps ?? []).length > 0 && <Steps steps={check.steps} level={check.level ?? 0} />}
          <Identifiers ids={check.identifiers} />
        </Stack>
        <Stack gap={1}>
          {(check.records ?? []).map((r) => (
            <RecordCard key={`${r.source}-${r.doi ?? r.title}`} rec={r} />
          ))}
          {(check.orcid_profiles ?? []).map((p) => (
            <Paper key={p.orcid} variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label="ORCID" />
                <Typography variant="body2">
                  <ExtLink href={p.url}>{p.name || p.orcid}</ExtLink>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  работ в профиле: {(p.works ?? []).length}
                </Typography>
              </Stack>
            </Paper>
          ))}
          {(check.urls ?? []).map((u) => (
            <Paper key={u.url} variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={u.ok ? 'success' : 'warning'} label={u.ok ? `открывается${u.status ? ` (${u.status})` : ''}` : 'не открылась'} />
                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                  <ExtLink href={u.ok ? u.final_url || u.url : null}>{truncate(u.url, 80)}</ExtLink>
                </Typography>
              </Stack>
              {(u.title || u.error) && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {u.title || u.error}
                </Typography>
              )}
            </Paper>
          ))}
          {check.candidate && (
            <Paper variant="outlined" sx={{ p: 1.25, borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" display="block">
                Похожая запись по названию (совпадение {Math.round((check.candidate.similarity ?? 0) * 100)}%) — не доказательство:
              </Typography>
              <Typography variant="body2">
                <ExtLink href={check.candidate.url}>{check.candidate.title}</ExtLink>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[check.candidate.venue, check.candidate.year, (check.candidate.authors ?? []).slice(0, 4).join(', ')].filter(Boolean).join(' · ')}
              </Typography>
            </Paper>
          )}
        </Stack>
      </Box>
      {flags.length > 0 && (
        <Stack gap={0.75} sx={{ mt: 1.5 }}>
          {flags.map((f) => (
            <Alert key={`${f.code}-${f.text}`} severity={f.severity === 'error' ? 'error' : 'warning'} sx={{ py: 0 }}>
              {f.text}
            </Alert>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
