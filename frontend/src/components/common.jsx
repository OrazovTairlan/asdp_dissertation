import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material';
import { RESULT_STATUS, STATUS } from '../utils/format';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Stack direction="row" gap={1}>{actions}</Stack>}
    </Stack>
  );
}

export function StatusChip({ status, resultStatus, size = 'small' }) {
  const info = (resultStatus && RESULT_STATUS[resultStatus]) || STATUS[status] || { label: status, color: 'default' };
  return (
    <Chip
      size={size}
      color={info.color}
      label={info.label}
      variant={info.color === 'default' ? 'outlined' : 'filled'}
      icon={status === 'running' ? <CircularProgress size={12} color="inherit" /> : undefined}
    />
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <Stack alignItems="center" textAlign="center" gap={1} sx={{ py: 6, color: 'text.secondary' }}>
      {icon}
      <Typography variant="subtitle1" color="text.primary">
        {title}
      </Typography>
      {children && <Typography variant="body2">{children}</Typography>}
    </Stack>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel = 'Удалить', onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{text}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
