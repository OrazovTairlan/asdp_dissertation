import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ResultView from './ResultView';
import { doneSubmission } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

describe('ResultView', () => {
  it('показывает итоговый KPI, сотрудника, должность и ссылку на Excel', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Итоговый KPI: 90%' })).toBeInTheDocument();
    expect(screen.getByText('Тестов Т.Т.')).toBeInTheDocument();
    expect(screen.getByText(/Профессор/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Excel/ })).toHaveAttribute('href', '/api/submissions/abc123/export.xlsx');
  });

  it('таблица блоков содержит веса, исполнение и вклад', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Итоги по блокам KPI' });
    expect(within(table).getByText('Научная работа')).toBeInTheDocument();
    expect(within(table).getAllByText('60%')).toHaveLength(2);
    expect(within(table).getByText('Качество преподавания')).toBeInTheDocument();
    expect(within(table).getByText('30%')).toBeInTheDocument();
    expect(within(table).getByText('90%')).toBeInTheDocument();
  });

  it('обоснование: вердикты, цитаты и проверка условий с цитатами-доказательствами', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText('Засчитано')).toBeInTheDocument();
    expect(screen.getByText('Неполное подтверждение')).toBeInTheDocument();
    expect(screen.getByText(/Статья «Alpha» принята в журнал Q1/)).toBeInTheDocument();
    const checks = screen.getAllByRole('list', { name: 'Проверка условий показателя' })[0];
    expect(within(checks).getByText('квартиль Q1/Q2')).toBeInTheDocument();
    expect(within(checks).getByText('«журнал Q1»')).toBeInTheDocument();
    expect(within(checks).getByText('нет явного статуса')).toBeInTheDocument();
    expect(screen.getAllByTitle('Условие подтверждено').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Условие не подтверждено').length).toBeGreaterThan(0);
  });

  it('числовые значения, заметки и отброшенные проверкой цитат', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText(/Показатель 1: 60%/)).toBeInTheDocument();
    expect(screen.getByText(/не задаёт формулу/)).toBeInTheDocument();
    expect(screen.getByText(/Отброшено проверкой цитат: 1/)).toBeInTheDocument();
  });

  it('предупреждения, достижения вне показателей, изображения и параметры запуска', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText(/попытку повлиять/)).toBeInTheDocument();
    expect(screen.getByText(/Организовал кружок любителей шахмат/)).toBeInTheDocument();
    expect(screen.getByText('Анализ изображений')).toBeInTheDocument();
    expect(screen.getByAltText('Изображение cert.jpg')).toHaveAttribute('src', '/api/submissions/abc123/files/cert.jpg');
    await user.click(screen.getByText('Воспроизводимость: параметры запуска'));
    expect(screen.getByText('2.0.1')).toBeInTheDocument();
    expect(screen.getByText('0 / 1 / 42')).toBeInTheDocument();
  });

  it('смена карты KPI вызывает пересчёт с индексом', async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={onRerun} />);
    const apply = screen.getByRole('button', { name: 'Применить' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Карта KPI' }));
    await user.click(screen.getByRole('option', { name: /после окончания/ }));
    await user.click(apply);
    expect(onRerun).toHaveBeenCalledWith({ positionKey: 'P1', scopeIndex: 1 });
  });

  it('нужна должность → выбор вручную и пересчёт', async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    const sub = {
      ...doneSubmission,
      result: { status: 'needs_position', employee: '', warnings: ['Должность не определена.'], positions_available: ['Доцент', 'Профессор'], images: {} },
    };
    renderWithProviders(<ResultView submission={sub} onRerun={onRerun} />);
    expect(screen.getByText(/Должность не определена по тексту/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пересчитать' }));
    expect(onRerun).toHaveBeenCalledWith({ positionName: 'Доцент' });
  });
});
