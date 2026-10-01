import { useMemo, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { truncate } from '../utils/format';

export default function CatalogViewer({ catalog }) {
  const [query, setQuery] = useState('');
  const positions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    return q ? catalog.positions.filter((p) => p.name.toLocaleLowerCase('ru').includes(q)) : catalog.positions;
  }, [catalog, query]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Typography variant="h6">Разобранный каталог: {catalog.name}</Typography>
        <TextField
          size="small"
          placeholder="Поиск по должности"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Поиск по должности' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>

      {catalog.warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {catalog.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </Box>
        </Alert>
      )}

      {positions.map((p) => {
        const sumOk = Math.abs(p.weight_sum - 100) < 0.01;
        return (
          <Accordion key={p.key}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1">{p.name}</Typography>
                <Chip size="small" variant="outlined" label={truncate(p.scope, 70)} />
                <Chip size="small" color={sumOk ? 'success' : 'error'} label={`Σ весов ${p.weight_sum}%`} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {p.blocks.map((b) => (
                <Accordion key={b.id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2">{b.title || truncate(b.items[0].text, 70)}</Typography>
                      <Chip size="small" label={`вес ${b.weight}%`} />
                      <Chip size="small" variant="outlined" label={`цель: ${b.target.raw || '—'}`} />
                      <Chip size="small" variant="outlined" label={b.kind === 'metric' ? 'числовой' : 'счётный'} />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    {b.mode_text && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        {b.mode_text}
                      </Typography>
                    )}
                    {b.items.map((i) => (
                      <Stack key={i.id} direction="row" gap={1.5} sx={{ py: 0.75, borderTop: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28 }}>
                          {i.num}.
                        </Typography>
                        <Typography variant="body2">{i.text}</Typography>
                      </Stack>
                    ))}
                  </AccordionDetails>
                </Accordion>
              ))}
            </AccordionDetails>
          </Accordion>
        );
      })}
      {positions.length === 0 && <Typography color="text.secondary">Ничего не найдено.</Typography>}
    </Box>
  );
}
