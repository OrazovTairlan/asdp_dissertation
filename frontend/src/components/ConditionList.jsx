import { List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

export default function ConditionList({ conditions = [] }) {
  if (!conditions.length) return null;
  return (
    <List dense disablePadding aria-label="Проверка условий показателя">
      {conditions.map((c, i) => (
        <ListItem key={`${c.condition}-${i}`} disableGutters alignItems="flex-start" sx={{ py: 0.25 }}>
          <ListItemIcon sx={{ minWidth: 30, mt: 0.5 }}>
            {c.supported ? (
              <CheckCircleIcon color="success" fontSize="small" titleAccess="Условие подтверждено" />
            ) : (
              <CancelIcon color="error" fontSize="small" titleAccess="Условие не подтверждено" />
            )}
          </ListItemIcon>
          <ListItemText
            primary={c.condition}
            secondary={c.supported ? `«${c.evidence}»` : c.note || 'нет явного подтверждения в тексте'}
            slotProps={{
              primary: { variant: 'body2' },
              secondary: { variant: 'caption', sx: { fontStyle: c.supported ? 'italic' : 'normal' } },
            }}
          />
        </ListItem>
      ))}
    </List>
  );
}
