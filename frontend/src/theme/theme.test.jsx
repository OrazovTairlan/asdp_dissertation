import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createAppTheme } from './createAppTheme';
import { DEFAULT_PALETTE, PALETTES } from './palettes';
import ThemeSwitcher from './ThemeSwitcher';
import { renderWithProviders } from '../test/render';

describe('createAppTheme', () => {
  it.each(Object.keys(PALETTES))('строит светлую и тёмную тему для палитры %s', (key) => {
    const light = createAppTheme(key, 'light');
    const dark = createAppTheme(key, 'dark');
    expect(light.palette.mode).toBe('light');
    expect(dark.palette.mode).toBe('dark');
    expect(light.palette.primary.main).toBe(PALETTES[key].primary.light);
    expect(dark.palette.primary.main).toBe(PALETTES[key].primary.dark);
    expect(light.palette.background.default).not.toBe(dark.palette.background.default);
  });

  it('неизвестная палитра → палитра по умолчанию', () => {
    expect(createAppTheme('nope', 'light').palette.primary.main).toBe(PALETTES[DEFAULT_PALETTE].primary.light);
  });

  it('шрифт и скругления заданы', () => {
    const t = createAppTheme();
    expect(t.typography.fontFamily).toContain('Inter');
    expect(t.shape.borderRadius).toBe(12);
  });
});

describe('ThemeSwitcher', () => {
  it('переключает режим и палитру и сохраняет выбор', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeSwitcher />);

    await user.click(screen.getByRole('button', { name: 'Тема оформления' }));
    await user.click(screen.getByRole('button', { name: 'Тёмная' }));
    expect(localStorage.getItem('kpi-theme-mode')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Палитра Изумруд' }));
    expect(localStorage.getItem('kpi-theme-palette')).toBe('emerald');
    expect(screen.getByRole('button', { name: 'Палитра Изумруд' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Светлая' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('восстанавливает сохранённые настройки', () => {
    localStorage.setItem('kpi-theme-mode', 'dark');
    localStorage.setItem('kpi-theme-palette', 'violet');
    renderWithProviders(<ThemeSwitcher />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('игнорирует некорректные значения в хранилище', () => {
    localStorage.setItem('kpi-theme-mode', 'neon');
    localStorage.setItem('kpi-theme-palette', 'rainbow');
    renderWithProviders(<ThemeSwitcher />);
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
  });
});
