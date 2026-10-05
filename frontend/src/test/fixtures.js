export const health = {
  reachable: true,
  ollama_url: 'http://localhost:11434',
  text_model: 'gpt-oss:20b',
  vision_model: 'qwen2.5vl:7b',
  text_model_ok: true,
  vision_model_ok: true,
  version: '1.0.0',
  prompt_version: '2.0.1',
  settings: { temperature: 0, top_k: 1, num_ctx: 16384, think: 'low', seed: 42, llm_cache: true },
};

export const block1 = {
  id: 'P1-B1',
  title: 'Научная работа',
  kind: 'count',
  mode_text: 'Один из следующих показателей',
  weight: 60,
  target: { raw: '1', kind: 'count', value: 1 },
  items: [{ id: 'P1-B1-I1', num: '1', text: 'Статья в журнале Q1/Q2, статус Accepted, аффилиация AITU' }],
  matches: [
    {
      indicator_id: 'P1-B1-I1',
      indicator_num: '1',
      achievement_id: 'A1',
      quote: 'Статья «Alpha» принята в журнал Q1',
      source: 'документ «report.txt»',
      verdict: 'confirmed',
      counted: true,
      missing_conditions: '',
      reasoning: 'Все условия подтверждены',
      conditions: [
        { condition: 'квартиль Q1/Q2', supported: true, evidence: 'журнал Q1', note: '' },
        { condition: 'статус Accepted', supported: false, evidence: '', note: 'нет явного статуса' },
      ],
      evidence: [{ image_id: 'img1', filename: 'cert.jpg', level: 'ok' }],
    },
    {
      indicator_id: 'P1-B1-I1',
      indicator_num: '1',
      achievement_id: 'A2',
      quote: 'Статья принята в журнал Q4',
      source: 'документ «report.txt»',
      verdict: 'partial',
      counted: false,
      missing_conditions: 'квартиль Q1/Q2',
      reasoning: '',
      conditions: [{ condition: 'квартиль Q1/Q2', supported: false, evidence: '', note: '' }],
      evidence: [],
    },
  ],
  metrics: [],
  rejected: [],
  notes: [],
  achieved: 1,
  fulfillment: 100,
  contribution: 60,
};

export const block2 = {
  id: 'P1-B2',
  title: 'Качество преподавания',
  kind: 'metric',
  mode_text: 'Среднее значение',
  weight: 40,
  target: { raw: 'не менее 80%', kind: 'percent', value: 80 },
  items: [{ id: 'P1-B2-I1', num: '1', text: 'Анкетирование студентов' }],
  matches: [],
  metrics: [{ indicator_id: 'P1-B2-I1', indicator_num: '1', value: 60, quote: 'Результат анкетирования: 60%', source: 'документ «report.txt»' }],
  rejected: [{ reason: 'число из ответа модели отсутствует в цитате' }],
  notes: ['Положение не задаёт формулу для процентных показателей; применено min(значение / целевое, 100%).'],
  achieved: 60,
  fulfillment: 75,
  contribution: 30,
};

export const doneSubmission = {
  id: 'abc123',
  catalog_id: 'cat1',
  status: 'done',
  files: ['report.txt', 'cert.jpg'],
  employee: 'Тестов Т.Т.',
  steps: [
    { t: 0, msg: 'Документ «report.txt»: извлечение текста и таблиц…' },
    { t: 12.5, msg: 'Готово' },
  ],
  result: {
    status: 'done',
    employee: 'Тестов Т.Т.',
    position: { name: 'Профессор', source: 'поле «Должность» в отчёте', key: 'P1' },
    scope: { index: 0, label: 'до окончания первого периода', options: ['до окончания первого периода', 'после окончания'] },
    kpi_total_pct: 90,
    weights_total: 100,
    blocks: [block1, block2],
    unmatched_achievements: [{ id: 'A3', quote: 'Организовал кружок любителей шахмат', source: 'документ «report.txt»' }],
    warnings: ['⚠ В документе найдена фраза, похожая на попытку повлиять на оценку'],
    images: {
      img1: {
        id: 'img1',
        filename: 'cert.jpg',
        integrity: { status: 'ok', problems: [], format: 'JPEG', width: 1600, height: 1130 },
        blur: { label: 'sharp', text: 'Резкое', score: 300 },
        tamper: { risk: 'low', signals: [{ text: 'нет признаков', weight: 0 }], disclaimer: 'Это индикаторы риска, а не доказательство.' },
        vision: { description: 'Сертификат о прохождении курса', document_type: 'certificate', extracted_text: 'СЕРТИФИКАТ 62 часа' },
        verdict: { usable: true, level: 'ok', reasons: [] },
        errors: [],
      },
    },
    run_config: {
      prompt_version: '2.0.1',
      text_model: 'gpt-oss:20b',
      text_model_digest: '17052f91a42e97930aa6e28a6c6c06a983e6a58d',
      vision_model: 'qwen2.5vl:7b',
      temperature: 0,
      top_k: 1,
      seed: 42,
      num_ctx: 16384,
      think: 'low',
      cache: true,
    },
    disclaimer: 'Предварительная автоматическая оценка. Итоговое решение принимает Комиссия.',
  },
};

export const catalogSummary = {
  id: 'cat1',
  name: 'Положение о KPI',
  files: ['kpi.pdf'],
  created_at: '2026-01-10T10:00:00+00:00',
  positions_count: 2,
  indicators_count: 12,
  warnings_count: 0,
};

export const catalogFull = {
  ...catalogSummary,
  warnings: ['Должность «X»: сумма весов блоков = 90%, ожидается 100%'],
  positions: [
    {
      key: 'P1',
      name: 'Профессор',
      scope: 'до окончания первого периода',
      weight_sum: 100,
      blocks: [{ ...block1 }],
    },
    {
      key: 'P2',
      name: 'Доцент',
      scope: 'до окончания первого периода',
      weight_sum: 90,
      blocks: [{ ...block2, id: 'P2-B1' }],
    },
  ],
};

export const submissionListItem = {
  id: 'abc123',
  created_at: '2026-02-01T09:30:00+00:00',
  status: 'done',
  files: ['report.txt'],
  employee: 'Тестов Т.Т.',
  position: 'Профессор',
  kpi: 90,
};
