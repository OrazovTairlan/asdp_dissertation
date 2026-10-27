import { describe, expect, it } from 'vitest';
import { clamp, formatDate, identifierList, kpiColor, matchVerdict, quoteSpans, splitHighlight, suggestQuestions, truncate } from './format';
import { doneSubmission } from '../test/fixtures';

describe('format', () => {
  it('kpiColor: пороги 80 / 50', () => {
    expect(kpiColor(100)).toBe('success');
    expect(kpiColor(80)).toBe('success');
    expect(kpiColor(79.9)).toBe('warning');
    expect(kpiColor(50)).toBe('warning');
    expect(kpiColor(49)).toBe('error');
  });

  it('clamp', () => {
    expect(clamp(120)).toBe(100);
    expect(clamp(-5)).toBe(0);
    expect(clamp(42)).toBe(42);
  });

  it('truncate', () => {
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate(null)).toBe('');
  });

  it('formatDate', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2026-02-01T09:30:00+00:00')).toMatch(/2026/);
  });

  it('matchVerdict', () => {
    expect(matchVerdict({ counted: true }).color).toBe('success');
    expect(matchVerdict({ counted: false, verdict: 'needs_review' }).color).toBe('error');
    expect(matchVerdict({ counted: false, verdict: 'partial' }).color).toBe('warning');
  });
});

describe('publication helpers', () => {
  it('identifierList строит ссылки на doi.org, orcid.org, arxiv и pubmed', () => {
    const list = identifierList({ doi: ['10.1/x'], orcid: ['0000-0002-1825-0097'], arxiv: ['1706.03762'], pmid: ['123'], url: ['https://a.org'] });
    expect(list.map((i) => i.href)).toEqual([
      'https://doi.org/10.1/x',
      'https://orcid.org/0000-0002-1825-0097',
      'https://arxiv.org/abs/1706.03762',
      'https://pubmed.ncbi.nlm.nih.gov/123/',
      'https://a.org',
    ]);
    expect(identifierList(undefined)).toEqual([]);
  });

  it('splitHighlight выделяет фрагмент без учёта регистра', () => {
    expect(splitHighlight('Статья принята в журнал Q1', 'ПРИНЯТА')).toEqual(['Статья ', 'принята', ' в журнал Q1']);
    expect(splitHighlight('abc', 'zzz')).toEqual(['abc', '', '']);
    expect(splitHighlight('abc', 'abc')).toEqual(['abc', '', '']);
    expect(splitHighlight('abc', '')).toEqual(['abc', '', '']);
  });
});

describe('chat helpers', () => {
  it('quoteSpans выделяет внешние кавычки с вложенными', () => {
    expect(quoteSpans('Ответ: «Статья «Alpha» принята» и «Q1».')).toEqual([
      { text: 'Ответ: ' },
      { quote: 'Статья «Alpha» принята' },
      { text: ' и ' },
      { quote: 'Q1' },
      { text: '.' },
    ]);
    expect(quoteSpans('без кавычек')).toEqual([{ text: 'без кавычек' }]);
    expect(quoteSpans('незакрытая «цитата')).toEqual([{ text: 'незакрытая ' }, { text: '«цитата' }]);
  });

  it('suggestQuestions строит вопросы по результату', () => {
    const q = suggestQuestions(doneSubmission.result);
    expect(q[0]).toBe('Почему достижение A2 по показателю 1 не засчитано?');
    expect(q).toContain('На каком основании засчитано достижение A1?');
    expect(q).toContain('Почему достижение A3 не отнесено ни к одному показателю?');
    expect(q.at(-1)).toBe('Что нужно добавить в отчёт, чтобы повысить KPI?');
    expect(suggestQuestions(null)).toEqual([]);
  });
});
