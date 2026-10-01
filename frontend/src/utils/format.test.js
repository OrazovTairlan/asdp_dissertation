import { describe, expect, it } from 'vitest';
import { clamp, formatDate, kpiColor, matchVerdict, truncate } from './format';

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
