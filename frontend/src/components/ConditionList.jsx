import { Box, Chip, List, ListItem, ListItemIcon, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { truncate } from '../utils/format';

function Line({ label, children, color = 'text.secondary', italic = false }) {
  return (
    <Typography variant="caption" color={color} component="div" sx={{ fontStyle: italic ? 'italic' : 'normal' }}>
      {label && <Box component="span" sx={{ fontWeight: 600, fontStyle: 'normal' }}>{label} </Box>}
      {children}
    </Typography>
  );
}

export default function ConditionList({ conditions = [] }) {
  if (!conditions.length) return null;
  return (
    <List dense disablePadding aria-label="Проверка условий показателя">
      {conditions.map((c, i) => {
        const byCode = c.model_supported && !c.supported;
        return (
          <ListItem key={`${c.condition_id || c.condition}-${i}`} disableGutters alignItems="flex-start" sx={{ py: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>
              {c.supported ? (
                <CheckCircleIcon color="success" fontSize="small" titleAccess="Условие подтверждено" />
              ) : c.skipped ? (
                <RadioButtonUncheckedIcon color="disabled" fontSize="small" titleAccess="Альтернатива не требуется" />
              ) : (
                <CancelIcon color="error" fontSize="small" titleAccess="Условие не подтверждено" />
              )}
            </ListItemIcon>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
                <Typography variant="body2">{c.condition}</Typography>
                {c.group && <Chip size="small" variant="outlined" label="одно из" sx={{ height: 20 }} />}
                {byCode && <Chip size="small" color="error" variant="outlined" label="решение программы" sx={{ height: 20 }} />}
              </Stack>
              {c.rule_quote && <Line label="Положение:">«{truncate(c.rule_quote, 220)}»</Line>}
              {c.evidence && (
                <Line label={c.supported ? 'В отчёте:' : 'В отчёте указано:'} color="text.primary" italic>
                  «{c.evidence}»
                </Line>
              )}
              {c.reasoning && <Line label="Модель:">{c.reasoning}</Line>}
              {c.skipped && <Line>альтернатива — достаточно другого подтверждённого варианта</Line>}
              {c.note ? (
                <Line label="Программа:" color="error.main">
                  {c.note}
                </Line>
              ) : (
                !c.supported && !c.skipped && !c.reasoning && <Line>нет явного подтверждения в тексте</Line>
              )}
            </Box>
          </ListItem>
        );
      })}
    </List>
  );
}
