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

export const PUB_STATUS = {
  verified: { label: 'Подтверждена', color: 'success' },
  found: { label: 'Найдена, подтверждено не всё', color: 'info' },
  candidate: { label: 'Кандидат по названию', color: 'warning' },
  no_identifiers: { label: 'Нет идентификаторов', color: 'default' },
  unavailable: { label: 'Базы недоступны', color: 'default' },
  not_found: { label: 'Не найдена', color: 'error' },
  conflict: { label: 'Противоречит заявлению', color: 'error' },
};

export const COVERAGE_STATUS = {
  fulfilled: { label: 'Выполнен', color: 'success' },
  review: { label: 'На проверку', color: 'error' },
  partial: { label: 'Не подтверждён', color: 'warning' },
  not_claimed: { label: 'Нет заявлений', color: 'default' },
};

const ID_LINK = {
  doi: (v) => `https://doi.org/${v}`,
  orcid: (v) => `https://orcid.org/${v}`,
  arxiv: (v) => `https://arxiv.org/abs/${v}`,
  pmid: (v) => `https://pubmed.ncbi.nlm.nih.gov/${v}/`,
  url: (v) => v,
};

export const identifierList = (ids = {}) =>
  Object.entries(ids).flatMap(([kind, values]) =>
    (values ?? []).filter(Boolean).map((value) => ({ kind, value, href: ID_LINK[kind]?.(value) ?? null })),
  );

export function splitHighlight(text, part) {
  const t = String(text ?? '');
  const p = String(part ?? '').trim();
  const i = p ? t.toLowerCase().indexOf(p.toLowerCase()) : -1;
  if (i < 0 || p.length === t.length) return [t, '', ''];
  return [t.slice(0, i), t.slice(i, i + p.length), t.slice(i + p.length)];
}

export function quoteSpans(text) {
  const s = String(text ?? '');
  const out = [];
  let depth = 0;
  let start = 0;
  let plain = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '«') {
      if (depth === 0) {
        if (i > plain) out.push({ text: s.slice(plain, i) });
        start = i + 1;
      }
      depth += 1;
    } else if (s[i] === '»' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        out.push({ quote: s.slice(start, i).trim() });
        plain = i + 1;
      }
    }
  }
  if (depth > 0) out.push({ text: s.slice(start - 1) });
  else if (plain < s.length) out.push({ text: s.slice(plain) });
  return out;
}

export function suggestQuestions(r) {
  if (!r?.blocks) return [];
  const matches = r.blocks.flatMap((b) => b.matches ?? []);
  const out = [];
  const missed = matches.find((m) => !m.counted);
  if (missed) out.push(`Почему достижение ${missed.achievement_id} по показателю ${missed.indicator_num} не засчитано?`);
  const counted = matches.find((m) => m.counted);
  if (counted) out.push(`На каком основании засчитано достижение ${counted.achievement_id}?`);
  const weak = r.blocks.find((b) => b.fulfillment < 100);
  if (weak) out.push(`Почему блок «${truncate(weak.title, 60)}» выполнен на ${weak.fulfillment}%?`);
  const um = (r.unmatched_achievements ?? [])[0];
  if (um) out.push(`Почему достижение ${um.id} не отнесено ни к одному показателю?`);
  out.push('Что нужно добавить в отчёт, чтобы повысить KPI?');
  return out.slice(0, 5);
}
