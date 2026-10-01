export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export const kpiColor = (pct) => (pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error');

export const truncate = (s, n = 120) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const STATUS = {
  queued: { label: 'В очереди', color: 'default' },
  running: { label: 'Выполняется', color: 'info' },
  done: { label: 'Готово', color: 'success' },
  error: { label: 'Ошибка', color: 'error' },
};

export const RESULT_STATUS = {
  needs_position: { label: 'Нужна должность', color: 'warning' },
  no_content: { label: 'Нет текста', color: 'warning' },
};

export function matchVerdict(m) {
  if (m.counted) return { label: 'Засчитано', color: 'success' };
  if (m.verdict === 'needs_review') return { label: 'На проверку человеку', color: 'error' };
  return { label: 'Неполное подтверждение', color: 'warning' };
}

export const IMAGE_LEVEL = {
  ok: { label: 'Пригодно', color: 'success' },
  warn: { label: 'Есть замечания', color: 'warning' },
  bad: { label: 'Не принимать без проверки', color: 'error' },
};

export const TAMPER_RISK = {
  low: { label: 'риск низкий', color: 'success' },
  medium: { label: 'риск средний', color: 'warning' },
  high: { label: 'риск высокий', color: 'error' },
};

export const BLUR_LABEL = {
  sharp: { color: 'success' },
  slight: { color: 'warning' },
  blurred: { color: 'error' },
  unknown: { color: 'default' },
};
