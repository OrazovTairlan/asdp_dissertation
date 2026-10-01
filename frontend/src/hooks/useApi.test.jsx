import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApi, useSubmission } from './useApi';
import { api } from '../api';

vi.mock('../api', () => ({ api: { getSubmission: vi.fn(), health: vi.fn() } }));

describe('useApi', () => {
  it('загружает данные и позволяет перезагрузить', async () => {
    const fn = vi.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('B');
    const { result } = renderHook(() => useApi(fn, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('A'));
    result.current.reload();
    await waitFor(() => expect(result.current.data).toBe('B'));
  });

  it('сохраняет ошибку', async () => {
    const { result } = renderHook(() => useApi(() => Promise.reject(new Error('boom')), []));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });
});

describe('useSubmission', () => {
  it('опрашивает сервер, пока оценка выполняется, и останавливается на done', async () => {
    api.getSubmission
      .mockResolvedValueOnce({ id: 's', status: 'queued', steps: [] })
      .mockResolvedValueOnce({ id: 's', status: 'running', steps: [{ t: 1, msg: 'шаг' }] })
      .mockResolvedValue({ id: 's', status: 'done', steps: [], result: {} });

    const { result } = renderHook(() => useSubmission('s', 10));
    await waitFor(() => expect(result.current.data?.status).toBe('done'));
    const calls = api.getSubmission.mock.calls.length;
    expect(calls).toBe(3);
    await new Promise((r) => setTimeout(r, 60));
    expect(api.getSubmission.mock.calls.length).toBe(calls);
  });

  it('ошибка загрузки попадает в error', async () => {
    api.getSubmission.mockReset();
    api.getSubmission.mockRejectedValue(new Error('Не найдено'));
    const { result } = renderHook(() => useSubmission('zzz', 10));
    await waitFor(() => expect(result.current.error?.message).toBe('Не найдено'));
  });
});
