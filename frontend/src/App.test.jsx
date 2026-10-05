import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api';
import { catalogFull, catalogSummary, doneSubmission, health, submissionListItem } from './test/fixtures';
import { renderWithProviders } from './test/render';

vi.mock('./api', () => ({
  ApiError: class extends Error {},
  api: {
    health: vi.fn(),
    prompts: vi.fn(),
    listCatalogs: vi.fn(),
    getCatalog: vi.fn(),
    createCatalog: vi.fn(),
    deleteCatalog: vi.fn(),
    listSubmissions: vi.fn(),
    getSubmission: vi.fn(),
    createSubmission: vi.fn(),
    rerunSubmission: vi.fn(),
    deleteSubmission: vi.fn(),
    exportUrl: (id) => `/api/submissions/${id}/export.xlsx`,
    fileUrl: (id, name) => `/api/submissions/${id}/files/${name}`,
  },
}));

const file = (name) => new File(['x'], name, { type: 'text/plain' });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset?.());
  api.health.mockResolvedValue(health);
  api.listCatalogs.mockResolvedValue([catalogSummary]);
  api.getCatalog.mockResolvedValue(catalogFull);
  api.listSubmissions.mockResolvedValue([submissionListItem]);
  api.getSubmission.mockResolvedValue(doneSubmission);
  api.prompts.mockResolvedValue({
    version: '2.0.1',
    prompts: { ground_rules: 'ТЫ — ИСПОЛНИТЕЛЬ ПРАВИЛ KPI', classify: 'ЗАДАЧА: классификация' },
    modelfile: 'FROM gpt-oss:20b',
  });
});

describe('навигация и панель', () => {
  it('панель показывает статистику и последние оценки', async () => {
    renderWithProviders(<App />);
    expect(await screen.findByRole('heading', { name: 'Панель' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Последние оценки' });
    expect(within(table).getByText('Тестов Т.Т.')).toBeInTheDocument();
    expect(await screen.findByText('90%', { selector: '.MuiTypography-h5' })).toBeInTheDocument();
    expect(await screen.findByTestId('health-chip')).toHaveTextContent('gpt-oss:20b');
  });

  it('Ollama недоступна → предупреждение и красный индикатор', async () => {
    api.health.mockResolvedValue({ ...health, reachable: false, text_model_ok: false });
    renderWithProviders(<App />);
    expect(await screen.findByText(/Ollama недоступна по адресу/)).toBeInTheDocument();
    expect(await screen.findByTestId('health-chip')).toHaveTextContent('Ollama недоступна');
  });

  it('меню ведёт на страницу правил модели с текстами промптов', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);
    await user.click(await screen.findByRole('link', { name: 'Правила модели' }));
    expect(await screen.findByRole('heading', { name: 'Правила модели' })).toBeInTheDocument();
    expect(await screen.findByTestId('prompt-text')).toHaveTextContent('ТЫ — ИСПОЛНИТЕЛЬ ПРАВИЛ KPI');
    await user.click(screen.getByRole('tab', { name: 'classify' }));
    expect(screen.getByTestId('prompt-text')).toHaveTextContent('ЗАДАЧА: классификация');
    await user.click(screen.getByRole('tab', { name: 'modelfile' }));
    expect(screen.getByTestId('prompt-text')).toHaveTextContent('FROM gpt-oss:20b');
  });

  it('неизвестный маршрут', async () => {
    renderWithProviders(<App />, { route: '/nope' });
    expect(await screen.findByText('Страница не найдена')).toBeInTheDocument();
  });
});

describe('каталоги', () => {
  it('загрузка документа → разбор → просмотр каталога с предупреждениями', async () => {
    const user = userEvent.setup();
    api.createCatalog.mockResolvedValue({ ...catalogSummary, warnings: catalogFull.warnings });
    renderWithProviders(<App />, { route: '/catalogs' });

    expect(await screen.findByRole('table', { name: 'Сохранённые каталоги' })).toBeInTheDocument();
    const upload = screen.getByRole('button', { name: 'Разобрать и сохранить' });
    expect(upload).toBeDisabled();

    await user.upload(screen.getByTestId('file-input'), file('kpi.pdf'));
    await user.type(screen.getByLabelText('Название (необязательно)'), 'Тест');
    await user.click(upload);

    await waitFor(() => expect(api.createCatalog).toHaveBeenCalledTimes(1));
    expect(api.createCatalog.mock.calls[0][1]).toBe('Тест');
    expect(await screen.findByText(/Разобранный каталог/)).toBeInTheDocument();
    expect(screen.getAllByText(/сумма весов блоков = 90%/).length).toBeGreaterThan(0);
    expect(screen.getByText('Σ весов 90%')).toBeInTheDocument();
  });

  it('поиск по должности в просмотре', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/catalogs' });
    await user.click(await screen.findByRole('button', { name: /Открыть Положение о KPI/ }));
    expect(await screen.findByText('Профессор')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Поиск по должности' }), 'доц');
    expect(screen.queryByText('Профессор')).not.toBeInTheDocument();
    expect(screen.getByText('Доцент')).toBeInTheDocument();
  });

  it('удаление каталога требует подтверждения', async () => {
    const user = userEvent.setup();
    api.deleteCatalog.mockResolvedValue({ ok: true });
    renderWithProviders(<App />, { route: '/catalogs' });
    await user.click(await screen.findByRole('button', { name: /Удалить Положение о KPI/ }));
    expect(api.deleteCatalog).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(api.deleteCatalog).toHaveBeenCalledWith('cat1'));
  });

  it('ошибка сервера при загрузке показывается уведомлением', async () => {
    const user = userEvent.setup();
    api.createCatalog.mockRejectedValue(new Error('формат .exe не поддерживается'));
    renderWithProviders(<App />, { route: '/catalogs' });
    await user.upload(await screen.findByTestId('file-input'), file('x.pdf'));
    await user.click(screen.getByRole('button', { name: 'Разобрать и сохранить' }));
    expect(await screen.findByText('формат .exe не поддерживается')).toBeInTheDocument();
  });
});

describe('оценка отчёта', () => {
  it('без каталогов предлагает загрузить его', async () => {
    api.listCatalogs.mockResolvedValue([]);
    renderWithProviders(<App />, { route: '/evaluate' });
    expect(await screen.findByText(/Сначала загрузите документ с критериями KPI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оценить KPI' })).toBeDisabled();
  });

  it('загрузка отчёта → переход на страницу результата', async () => {
    const user = userEvent.setup();
    api.createSubmission.mockResolvedValue({ id: 'abc123' });
    renderWithProviders(<App />, { route: '/evaluate' });

    await user.upload(await screen.findByTestId('file-input'), [file('report.txt')]);
    const go = screen.getByRole('button', { name: 'Оценить KPI' });
    await waitFor(() => expect(go).toBeEnabled());
    await user.click(go);

    await waitFor(() => expect(api.createSubmission).toHaveBeenCalled());
    expect(api.createSubmission.mock.calls[0][0]).toMatchObject({ catalogId: 'cat1', employee: '', positionKey: '' });
    expect(await screen.findByRole('img', { name: 'Итоговый KPI: 90%' }, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('результат и история', () => {
  it('страница оценки в процессе показывает журнал шагов', async () => {
    api.getSubmission.mockResolvedValue({ ...doneSubmission, status: 'running', result: null, steps: [{ t: 3.2, msg: 'Определение должности сотрудника…' }] });
    renderWithProviders(<App />, { route: '/submissions/abc123' });
    expect(await screen.findByText('Обработка…')).toBeInTheDocument();
    expect(screen.getByText(/Определение должности сотрудника/)).toBeInTheDocument();
  });

  it('ошибка обработки', async () => {
    api.getSubmission.mockResolvedValue({ ...doneSubmission, status: 'error', error: 'LLMError: Ollama недоступен', result: null });
    renderWithProviders(<App />, { route: '/submissions/abc123' });
    expect(await screen.findByText(/LLMError: Ollama недоступен/)).toBeInTheDocument();
  });

  it('несуществующая оценка → сообщение об ошибке', async () => {
    api.getSubmission.mockRejectedValue(new Error('Не найдено'));
    renderWithProviders(<App />, { route: '/submissions/zzz' });
    expect(await screen.findByText('Не найдено')).toBeInTheDocument();
  });

  it('пересчёт с выбранной должностью вызывает API', async () => {
    const user = userEvent.setup();
    api.rerunSubmission.mockResolvedValue({ id: 'abc123' });
    api.getSubmission.mockResolvedValue({
      ...doneSubmission,
      result: { status: 'needs_position', employee: '', warnings: [], positions_available: ['Доцент'], images: {} },
    });
    renderWithProviders(<App />, { route: '/submissions/abc123' });
    await user.click(await screen.findByRole('button', { name: 'Пересчитать' }));
    await waitFor(() => expect(api.rerunSubmission).toHaveBeenCalledWith('abc123', { positionKey: 'Доцент', scopeIndex: 0 }));
  });

  it('история: поиск и удаление', async () => {
    const user = userEvent.setup();
    api.deleteSubmission.mockResolvedValue({ ok: true });
    api.listSubmissions.mockResolvedValue([
      submissionListItem,
      { ...submissionListItem, id: 'zzz999', employee: 'Петров П.П.', position: 'Доцент', kpi: 40 },
    ]);
    renderWithProviders(<App />, { route: '/history' });
    expect(await screen.findByText('Петров П.П.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Поиск по истории' }), 'доцент');
    expect(screen.queryByText('Тестов Т.Т.')).not.toBeInTheDocument();
    expect(screen.getByText('Петров П.П.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить оценку zzz999' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(api.deleteSubmission).toHaveBeenCalledWith('zzz999'));
  });

  it('пустая история', async () => {
    api.listSubmissions.mockResolvedValue([]);
    renderWithProviders(<App />, { route: '/history' });
    expect(await screen.findByText('Пока пусто')).toBeInTheDocument();
  });
});
