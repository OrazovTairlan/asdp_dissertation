import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status, body, statusText = 'Bad') =>
  Promise.resolve({ ok: false, status, statusText, json: () => (body ? Promise.resolve(body) : Promise.reject(new Error('no json'))) });

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('GET возвращает JSON', async () => {
    const f = vi.fn(() => ok({ reachable: true }));
    vi.stubGlobal('fetch', f);
    expect(await api.health()).toEqual({ reachable: true });
    expect(f).toHaveBeenCalledWith('/api/health', undefined);
  });

  it('ошибка с detail → ApiError с текстом сервера и статусом', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(400, { detail: 'формат .exe не поддерживается' })));
    await expect(api.getCatalog('x')).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'формат .exe не поддерживается' });
  });

  it('ошибка без JSON → statusText', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(502, null, 'Bad Gateway')));
    await expect(api.listCatalogs()).rejects.toThrow('Bad Gateway');
  });

  it('сетевая ошибка → понятное сообщение', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe('Нет связи с сервером');
  });

  it('createSubmission отправляет multipart с полями и файлами', async () => {
    const f = vi.fn(() => ok({ id: 's1' }));
    vi.stubGlobal('fetch', f);
    const file = new File(['x'], 'report.txt', { type: 'text/plain' });
    await api.createSubmission({ catalogId: 'c1', files: [file], employee: 'Иванов', positionKey: '' });
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('/api/submissions');
    expect(opts.method).toBe('POST');
    expect(opts.body.get('catalog_id')).toBe('c1');
    expect(opts.body.get('employee')).toBe('Иванов');
    expect(opts.body.has('position_key')).toBe(false);
    expect(opts.body.getAll('files')[0].name).toBe('report.txt');
  });

  it('rerun передаёт ключ должности и индекс карты', async () => {
    const f = vi.fn(() => ok({ id: 's1' }));
    vi.stubGlobal('fetch', f);
    await api.rerunSubmission('s1', { positionKey: 'P2', scopeIndex: 1 });
    const body = f.mock.calls[0][1].body;
    expect(body.get('position_key')).toBe('P2');
    expect(body.get('scope_index')).toBe('1');
  });

  it('формирует ссылки на экспорт и файлы', () => {
    expect(api.exportUrl('abc')).toBe('/api/submissions/abc/export.xlsx');
    expect(api.fileUrl('abc', 'файл 1.jpg')).toBe('/api/submissions/abc/files/%D1%84%D0%B0%D0%B9%D0%BB%201.jpg');
  });
});
