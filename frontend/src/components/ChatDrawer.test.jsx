import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultView from './ResultView';
import { api } from '../api';
import { doneSubmission } from '../test/fixtures';
import { renderWithProviders } from '../test/render';

vi.mock('../api', () => ({
  api: {
    getChat: vi.fn(),
    sendChat: vi.fn(),
    clearChat: vi.fn(),
    exportUrl: (id) => `/api/submissions/${id}/export.xlsx`,
    fileUrl: (id, name) => `/api/submissions/${id}/files/${name}`,
  },
}));

const answer = {
  role: 'assistant',
  content:
    'Ответ: достижение не засчитано.\nОснование:\n- в отчёте: «Статья принята в журнал Q4»\n- выдумано: «статья вышла в Nature в 2024 году»\nЧто изменило бы решение: указать квартиль Q1 или Q2.',
  citations: [
    { text: 'Статья принята в журнал Q4', found: true },
    { text: 'статья вышла в Nature в 2024 году', found: false },
  ],
  elapsed: 12.4,
};

beforeEach(() => {
  api.getChat.mockReset().mockResolvedValue({ messages: [], model: 'gpt-oss:20b' });
  api.sendChat.mockReset();
  api.clearChat.mockReset().mockResolvedValue({ messages: [] });
});

describe('диалог с моделью-оценщиком', () => {
  it('кнопка открывает диалог с подсказками; ответ показывает проверенные и непроверенные цитаты', async () => {
    const user = userEvent.setup();
    api.sendChat.mockImplementation(async (id, { message }) => ({ messages: [{ role: 'user', content: message, focus: null }, answer] }));
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Диалог с моделью' }));
    const dialog = await screen.findByRole('dialog', { name: 'Диалог с моделью-оценщиком' });
    expect(await within(dialog).findByText(/gpt-oss:20b/)).toBeInTheDocument();
    await user.click(within(dialog).getByText('Что нужно добавить в отчёт, чтобы повысить KPI?'));
    expect(api.sendChat).toHaveBeenCalledWith('abc123', { message: 'Что нужно добавить в отчёт, чтобы повысить KPI?', focus: null });
    const reply = await within(dialog).findByTestId('chat-answer');
    expect(within(reply).getByText('Ответ:')).toBeInTheDocument();
    expect(within(reply).getByText('«Статья принята в журнал Q4»')).toHaveAttribute('data-found', 'yes');
    expect(within(reply).getByText('«статья вышла в Nature в 2024 году»')).toHaveAttribute('data-found', 'no');
    expect(within(reply).getByText('Цитаты проверены: 1 из 2')).toBeInTheDocument();
    expect(within(reply).getByText('ответ за 12 с')).toBeInTheDocument();
    expect(within(dialog).getByTestId('chat-user')).toHaveTextContent('Что нужно добавить в отчёт');
  });

  it('«Спросить модель» в карточке решения подставляет вопрос и фокус; Enter отправляет', async () => {
    const user = userEvent.setup();
    api.sendChat.mockResolvedValue({ messages: [answer] });
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    const cardButtons = screen.getAllByRole('button', { name: 'Спросить модель' });
    await user.click(cardButtons[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Диалог с моделью-оценщиком' });
    const input = within(dialog).getByRole('textbox', { name: 'Вопрос модели' });
    expect(input).toHaveValue('Почему достижение A2 по показателю 1 не засчитано?');
    expect(within(dialog).getByText(/Вопрос о решении: A2 → показатель 1 \(«Научная работа»\)/)).toBeInTheDocument();
    await user.type(input, '{Enter}');
    expect(api.sendChat).toHaveBeenCalledWith('abc123', {
      message: 'Почему достижение A2 по показателю 1 не засчитано?',
      focus: { achievement_id: 'A2', indicator_id: 'P1-B1-I1' },
    });
    await within(dialog).findByTestId('chat-answer');
    expect(within(dialog).queryByText(/Вопрос о решении/)).not.toBeInTheDocument();
  });

  it('Markdown-жирный и альтернативные заголовки разделов отображаются аккуратно', async () => {
    const user = userEvent.setup();
    api.getChat.mockResolvedValue({
      messages: [{ role: 'assistant', content: '**Ответ:** не засчитано, **нет аффилиации**.\nЧто изменить в отчёте: указать аффилиацию.', citations: [] }],
      model: 'gpt-oss:20b',
    });
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Диалог с моделью' }));
    const reply = await screen.findByTestId('chat-answer');
    expect(within(reply).getByText('Ответ:')).toBeInTheDocument();
    expect(within(reply).getByText('нет аффилиации').tagName).toBe('B');
    expect(within(reply).getByText('Что изменить в отчёте:')).toBeInTheDocument();
    expect(reply).not.toHaveTextContent('**');
  });

  it('ошибка модели показывается, вопрос возвращается в поле ввода', async () => {
    const user = userEvent.setup();
    api.sendChat.mockRejectedValue(new Error('Ollama недоступен'));
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Диалог с моделью' }));
    const dialog = await screen.findByRole('dialog', { name: 'Диалог с моделью-оценщиком' });
    const input = within(dialog).getByRole('textbox', { name: 'Вопрос модели' });
    await user.type(input, 'Почему так?');
    await user.click(within(dialog).getByRole('button', { name: 'Отправить вопрос' }));
    expect(await within(dialog).findByText('Ollama недоступен')).toBeInTheDocument();
    expect(input).toHaveValue('Почему так?');
    expect(within(dialog).queryByTestId('chat-user')).not.toBeInTheDocument();
  });

  it('история загружается и очищается', async () => {
    const user = userEvent.setup();
    api.getChat.mockResolvedValue({ messages: [{ role: 'user', content: 'Старый вопрос', focus: null }, answer], model: 'gpt-oss:20b' });
    renderWithProviders(<ResultView submission={doneSubmission} onRerun={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Диалог с моделью' }));
    const dialog = await screen.findByRole('dialog', { name: 'Диалог с моделью-оценщиком' });
    expect(await within(dialog).findByText('Старый вопрос')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Очистить диалог' }));
    await waitFor(() => expect(within(dialog).queryByText('Старый вопрос')).not.toBeInTheDocument());
    expect(api.clearChat).toHaveBeenCalledWith('abc123');
  });
});
