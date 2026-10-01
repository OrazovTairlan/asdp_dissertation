import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, CircularProgress, MenuItem, Skeleton, Stack, TextField } from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotify } from '../components/Notify';
import FileDropzone from '../components/FileDropzone';
import { PageHeader } from '../components/common';

export default function EvaluatePage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const catalogs = useApi(api.listCatalogs, []);
  const [catalogId, setCatalogId] = useState('');
  const [positionKey, setPositionKey] = useState('');
  const [employee, setEmployee] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const effectiveCatalog = catalogId || catalogs.data?.[0]?.id || '';
  const detail = useApi(() => (effectiveCatalog ? api.getCatalog(effectiveCatalog) : Promise.resolve(null)), [effectiveCatalog]);

  const positions = [];
  const seen = new Set();
  (detail.data?.positions ?? []).forEach((p) => {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      positions.push(p);
    }
  });

  const submit = async () => {
    setBusy(true);
    try {
      const { id } = await api.createSubmission({ catalogId: effectiveCatalog, files, employee, positionKey });
      navigate(`/submissions/${id}`);
    } catch (e) {
      notify(e.message, 'error');
      setBusy(false);
    }
  };

  const noCatalogs = !catalogs.loading && (catalogs.data ?? []).length === 0;

  return (
    <>
      <PageHeader
        title="Оценка отчёта сотрудника"
        subtitle="Загрузите отчёт (PDF / DOCX / TXT / XLSX) и подтверждающие изображения — сертификаты, скриншоты, фото. Должность система берёт из строки «Должность: …» в отчёте."
      />

      {noCatalogs && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/catalogs" size="small">Загрузить</Button>}>
          Сначала загрузите документ с критериями KPI организации.
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack gap={2.5}>
            {catalogs.loading ? (
              <Skeleton variant="rounded" height={56} />
            ) : (
              <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                <TextField select size="small" label="Каталог KPI" value={effectiveCatalog} onChange={(e) => {
                    setCatalogId(e.target.value);
                    setPositionKey('');
                  }} disabled={noCatalogs} sx={{ flex: 1, minWidth: 220 }}>
                  {(catalogs.data ?? []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField size="small" label="ФИО (если нет в отчёте)" value={employee} onChange={(e) => setEmployee(e.target.value)} sx={{ flex: 1 }} />
                <TextField select size="small" label="Должность вручную" value={positionKey} onChange={(e) => setPositionKey(e.target.value)} sx={{ flex: 1, minWidth: 220 }}>
                  <MenuItem value="">— определить из отчёта —</MenuItem>
                  {positions.map((p) => (
                    <MenuItem key={p.key} value={p.key}>
                      {p.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}

            <FileDropzone
              files={files}
              onChange={setFiles}
              accept=".pdf,.docx,.xlsx,.xlsm,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
              title="Перетащите отчёт и изображения"
              hint="Документы и изображения вместе — или нажмите, чтобы выбрать"
              disabled={busy}
            />

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                size="large"
                disabled={!files.length || !effectiveCatalog || busy}
                onClick={submit}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <FactCheckIcon />}
              >
                Оценить KPI
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
