const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError('Нет связи с сервером', 0);
  }
  if (!res.ok) {
    let message = res.statusText || `Ошибка ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

function formData(fields, files = []) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, v);
  });
  files.forEach((f) => fd.append('files', f));
  return fd;
}

export const api = {
  health: () => request('/api/health'),
  prompts: () => request('/api/prompts'),

  listCatalogs: () => request('/api/catalogs'),
  getCatalog: (id) => request(`/api/catalogs/${id}`),
  createCatalog: (files, name = '') => request('/api/catalogs', { method: 'POST', body: formData({ name }, files) }),
  deleteCatalog: (id) => request(`/api/catalogs/${id}`, { method: 'DELETE' }),

  listSubmissions: () => request('/api/submissions'),
  getSubmission: (id) => request(`/api/submissions/${id}`),
  createSubmission: ({ catalogId, files, employee = '', positionKey = '' }) =>
    request('/api/submissions', {
      method: 'POST',
      body: formData({ catalog_id: catalogId, employee, position_key: positionKey }, files),
    }),
  rerunSubmission: (id, { positionKey = '', scopeIndex = 0 } = {}) =>
    request(`/api/submissions/${id}/rerun`, {
      method: 'POST',
      body: formData({ position_key: positionKey, scope_index: String(scopeIndex) }),
    }),
  deleteSubmission: (id) => request(`/api/submissions/${id}`, { method: 'DELETE' }),

  exportUrl: (id) => `${BASE}/api/submissions/${id}/export.xlsx`,
  fileUrl: (id, name) => `${BASE}/api/submissions/${id}/files/${encodeURIComponent(name)}`,
};
