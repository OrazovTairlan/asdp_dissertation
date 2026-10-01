import { Box, LinearProgress, Stack, Typography } from '@mui/material';

export default function ProcessingSteps({ steps = [], running = false }) {
  return (
    <Box>
      {running && <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />}
      <Stack
        component="ol"
        gap={0.5}
        sx={{ m: 0, p: 0, listStyle: 'none', maxHeight: 280, overflow: 'auto', fontFamily: 'ui-monospace, Consolas, monospace' }}
        aria-label="Ход обработки"
      >
        {steps.map((s, i) => (
          <Typography key={`${s.t}-${i}`} component="li" variant="caption" color="text.secondary">
            <Box component="span" sx={{ color: 'primary.main', mr: 1 }}>
              {String(s.t).padStart(6, ' ')}s
            </Box>
            {s.msg}
          </Typography>
        ))}
        {steps.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            Ожидание запуска…
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
