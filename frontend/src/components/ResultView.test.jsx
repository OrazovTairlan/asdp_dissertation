import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ResultView from './ResultView';
import { block1, doneSubmission } from '../test/fixtures';
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
    expect(screen.getByText('На проверку человеку')).toBeInTheDocument();
    expect(screen.getByText(/Статья «Alpha» принята в журнал Q1/)).toBeInTheDocument();
    const checks = screen.getAllByRole('list', { name: 'Проверка условий показателя' })[0];
    expect(within(checks).getByText('квартиль Q1/Q2')).toBeInTheDocument();
    expect(within(checks).getByText(/«журнал Q1»/)).toBeInTheDocument();
    expect(within(checks).getByText(/«журнале Q1\/Q2»/)).toBeInTheDocument();
    expect(within(checks).getByText(/Q1 входит в требуемые/)).toBeInTheDocument();
    expect(within(checks).getByText(/нет явного статуса/)).toBeInTheDocument();
    expect(within(checks).getByText('решение программы')).toBeInTheDocument();
    expect(screen.getAllByTitle('Условие подтверждено').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Условие не подтверждено').length).toBeGreaterThan(0);
  });

  it('числовые значения, заметки и отброшенные проверкой цитат', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText(/Показатель 1: 60%/)).toBeInTheDocument();
    expect(screen.getByText(/не задаёт формулу/)).toBeInTheDocument();
    expect(screen.getByText(/Отброшено проверкой цитат: 1/)).toBeInTheDocument();
  });

  it('предупреждения, достижения вне показателей, изображения с QR-кодом', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText(/попытку повлиять/)).toBeInTheDocument();
    expect(screen.getByText(/Организовал кружок любителей шахмат/)).toBeInTheDocument();
    expect(screen.getByText('Анализ изображений')).toBeInTheDocument();
    expect(screen.getByAltText('Изображение cert.jpg')).toHaveAttribute('src', '/api/submissions/abc123/files/cert.jpg');
    expect(screen.getByRole('link', { name: 'https://doi.org/10.5555/12345680' })).toBeInTheDocument();
    expect(screen.getByText('ISBN 978-3-16-148410-0')).toBeInTheDocument();
  });

  it('аргумент модели с выделенным фрагментом отчёта и второе мнение', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    const args = screen.getAllByTestId('model-argument');
    expect(within(args[0]).getByText('Почему засчитано')).toBeInTheDocument();
    expect(within(args[1]).getByText('Аргумент модели по тексту отчёта')).toBeInTheDocument();
    expect(within(args[1]).getByText(/Показатель требует Q1\/Q2/)).toBeInTheDocument();
    expect(screen.getByText('принята в журнал Q1', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByText('журнал Q4', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByText('Второе мнение модели:')).toBeInTheDocument();
  });

  it('показатели без заявлений свёрнуты и раскрываются по кнопке', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Нет заявлений по 1 показателю: 2' }));
    const cov = screen.getAllByRole('list', { name: 'Показатели блока' })[0];
    expect(within(cov).getByText('Нет заявлений')).toBeInTheDocument();
    expect(within(cov).getByText('Монография')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скрыть показатели без заявлений' })).toBeInTheDocument();
  });

  it('аргумент, опровергнутый проверкой цитат, помечается', () => {
    const m = { ...block1.matches[1], verdict: 'partial', argument_overridden: true, second_opinion: [] };
    const sub = { ...doneSubmission, result: { ...doneSubmission.result, blocks: [{ ...block1, matches: [m] }] } };
    renderWithProviders(<ResultView submission={sub} onRerun={vi.fn()} />);
    expect(screen.getByText('Решение модели скорректировано программой')).toBeInTheDocument();
    expect(screen.getByText(/решение принял код/)).toBeInTheDocument();
  });

  it('протокол решения, что нужно для зачёта и причины для достижений вне показателей', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    const [counted, review] = screen.getAllByRole('list', { name: 'Протокол решения' });
    expect(within(counted).getAllByRole('listitem')).toHaveLength(3);
    expect(within(counted).getByText(/Подтверждено 2 из 2/)).toBeInTheDocument();
    expect(within(review).getAllByRole('listitem')[1]).toHaveAttribute('data-status', 'warn');
    expect(screen.getByTestId('to-count')).toHaveTextContent('Явно указать в документах: квартиль Q1/Q2');
    expect(screen.getByTestId('not-matched-reason')).toHaveTextContent('Научная работа: Кружок — внеучебная работа');
  });

  it('сводка блока и статус каждого показателя', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText('Требуется 1, подтверждено 1. Блок выполнен.')).toBeInTheDocument();
    const cov = screen.getAllByRole('list', { name: 'Показатели блока' })[0];
    expect(within(cov).getByText('Выполнен')).toBeInTheDocument();
    expect(within(cov).queryByText('Нет заявлений')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Сводка проверки')).toHaveTextContent('засчитано: 1');
    expect(screen.getByLabelText('Сводка проверки')).toHaveTextContent('на проверку: 1');
  });

  it('проверка публикаций: уровни, идентификаторы, записи и замечания', () => {
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    expect(screen.getByText('Проверка публикаций и ссылок')).toBeInTheDocument();
    const [ok, bad] = screen.getAllByTestId('publication-check');
    expect(within(ok).getByText('Подтверждена')).toBeInTheDocument();
    expect(within(ok).getByRole('img', { name: 'Уровень проверки 4 из 4' })).toBeInTheDocument();
    expect(within(ok).getByRole('link', { name: /^Alpha/ })).toHaveAttribute('href', 'https://doi.org/10.5555/12345680');
    expect(within(ok).getByText('OpenAlex')).toBeInTheDocument();
    expect(within(ok).getByText(/Astana IT University/)).toBeInTheDocument();
    expect(within(ok).getByText('открывается (200)')).toBeInTheDocument();
    expect(within(bad).getByText('Не найдена')).toBeInTheDocument();
    expect(within(bad).getByRole('img', { name: 'Уровень проверки 1 из 4' })).toBeInTheDocument();
    expect(within(bad).getByRole('link', { name: 'DOI 10.1016/j.eswa.2099.123456' })).toHaveAttribute('href', 'https://doi.org/10.1016/j.eswa.2099.123456');
    expect(within(bad).getByRole('link', { name: /Josiah Carberry/ })).toHaveAttribute('href', 'https://orcid.org/0000-0002-1825-0097');
    expect(within(bad).getByText(/не найден ни в Crossref/)).toBeInTheDocument();
    expect(within(bad).getAllByTitle('Уровень пройден')).toHaveLength(1);
    expect(within(bad).getAllByTitle('Уровень не пройден')).toHaveLength(1);
    expect(within(bad).getAllByTitle('Уровень не проверялся')).toHaveLength(2);
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
