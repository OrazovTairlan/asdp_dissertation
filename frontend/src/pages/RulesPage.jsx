import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotify } from '../components/Notify';
import { PageHeader } from '../components/common';

const LAYERS = [
  ['Закрытый мир', 'Источники истины — только переданные показатели и документы сотрудника. Знания модели источником не являются.'],
  ['Жадное декодирование', 'temperature=0, top_k=1, top_p=1, фиксированный seed: нет случайности в выборе токенов.'],
  ['Структурированный вывод', 'indicator_id и achievement_id — enum из id каталога: вернуть несуществующий показатель нельзя.'],
  ['Проверка цитат кодом', 'Каждая цитата должна найтись в документах сотрудника, иначе сопоставление отбрасывается.'],
  ['Условия по одному', 'Для каждого условия показателя — своя цитата; решение «все условия выполнены» принимает код, а не булево поле модели.'],
  ['Арифметика в коде', 'Количество («2 выступления»), проценты, веса и итог считает программа.'],
  ['Целостность изображений', 'Повреждённое или вероятно отредактированное изображение не засчитывается автоматически.'],
  ['Защита от prompt injection', 'Фразы «игнорируй правила / поставь 100%» в отчёте помечаются проверяющему.'],
  ['Кэш и метаданные запуска', 'Одинаковый запрос даёт одинаковый ответ; модель, хэш весов и версия промптов сохраняются в результате.'],
];

export default function RulesPage() {
  const notify = useNotify();
  const { data, error, loading } = useApi(api.prompts, []);
  const [tab, setTab] = useState(0);

  const entries = data ? [...Object.entries(data.prompts), ['modelfile', data.modelfile]] : [];
  const current = entries[tab];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current[1]);
      notify('Скопировано', 'success');
    } catch {
      notify('Не удалось скопировать — выделите текст вручную', 'warning');
    }
  };

  return (
    <>
      <PageHeader
        title="Правила модели"
        subtitle="Модель — исполнитель правил KPI, а не советник. Ниже — какие меры не дают ей выдумывать, и точные тексты системных промптов, которые она получает на каждом шаге."
        actions={data && <Chip color="primary" label={`версия промптов ${data.version}`} />}
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, mb: 4 }}>
        {LAYERS.map(([title, text], i) => (
          <Card key={title}>
            <CardContent>
              <Typography variant="overline" color="primary">
                Слой {i + 1}
              </Typography>
              <Typography variant="subtitle1">{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {text}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Системные промпты
      </Typography>
      {error && <Alert severity="error">{error.message}</Alert>}
      {loading && <Skeleton variant="rounded" height={260} />}
      {data && (
        <Card>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="Промпты" sx={{ borderBottom: 1, borderColor: 'divider' }}>
            {entries.map(([key]) => (
              <Tab key={key} label={key} />
            ))}
          </Tabs>
          <CardContent>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy}>
                Копировать
              </Button>
            </Stack>
            <Box
              component="pre"
              data-testid="prompt-text"
              sx={{ m: 0, p: 2, borderRadius: 2, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, maxHeight: 460, overflow: 'auto', fontFamily: 'ui-monospace, Consolas, monospace' }}
            >
              {current[1]}
            </Box>
          </CardContent>
        </Card>
      )}
    </>
  );
}
