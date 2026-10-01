import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Skeleton, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api } from '../api';
import { useSubmission } from '../hooks/useApi';
import { useNotify } from '../components/Notify';
import ProcessingSteps from '../components/ProcessingSteps';
import ResultView from '../components/ResultView';
import { PageHeader, StatusChip } from '../components/common';

function SubmissionContent({ id }) {
  const notify = useNotify();
  const { data, error, reload } = useSubmission(id);
  const [busy, setBusy] = useState(false);

  const rerun = async ({ positionName, positionKey, scopeIndex = 0 }) => {
    setBusy(true);
    try {
      await api.rerunSubmission(id, { positionKey: positionKey ?? positionName ?? '', scopeIndex });
      reload();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return <Alert severity="error">{error.message}</Alert>;
  }
  if (!data) {
    return <Skeleton variant="rounded" height={260} />;
  }

  const running = data.status === 'queued' || data.status === 'running';
  return (
    <>
      <PageHeader
        title={data.result?.employee || data.employee || 'Оценка отчёта'}
        subtitle={`Файлы: ${data.files.join(', ')}`}
        actions={<StatusChip status={data.status} resultStatus={data.status === 'done' ? data.result?.status : undefined} size="medium" />}
      />
      {running && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Обработка…
            </Typography>
            <ProcessingSteps steps={data.steps} running />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Локальная модель на средней видеокарте тратит несколько минут на отчёт — страницу можно не закрывать, результат появится сам.
            </Typography>
          </CardContent>
        </Card>
      )}
      {data.status === 'error' && (
        <Stack gap={2}>
          <Alert severity="error">Ошибка: {data.error}</Alert>
          <Card>
            <CardContent>
              <ProcessingSteps steps={data.steps} />
            </CardContent>
          </Card>
        </Stack>
      )}
      {data.status === 'done' && <ResultView submission={data} onRerun={rerun} busy={busy} />}
    </>
  );
}

export default function SubmissionPage() {
  const { id } = useParams();
  return (
    <>
      <Button component={RouterLink} to="/history" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>
        К истории
      </Button>
      <SubmissionContent key={id} id={id} />
    </>
  );
}
