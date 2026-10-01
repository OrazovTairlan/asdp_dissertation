import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotify } from '../components/Notify';
import FileDropzone from '../components/FileDropzone';
import CatalogViewer from '../components/CatalogViewer';
import { ConfirmDialog, EmptyState, PageHeader } from '../components/common';
import { formatDate } from '../utils/format';

export default function CatalogsPage() {
  const notify = useNotify();
  const list = useApi(api.listCatalogs, []);
  const [files, setFiles] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastWarnings, setLastWarnings] = useState([]);
  const [viewId, setViewId] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const open = async (id) => {
    setViewId(id);
    try {
      setCatalog(await api.getCatalog(id));
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const upload = async () => {
    setBusy(true);
    setLastWarnings([]);
    try {
      const r = await api.createCatalog(files, name);
      notify(`Каталог сохранён: должностей — ${r.positions_count}, показателей — ${r.indicators_count}`, r.warnings.length ? 'warning' : 'success');
      setLastWarnings(r.warnings);
      setFiles([]);
      setName('');
      list.reload();
      await open(r.id);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const id = toDelete;
    setToDelete(null);
    try {
      await api.deleteCatalog(id);
      if (viewId === id) {
        setViewId(null);
        setCatalog(null);
      }
      notify('Каталог удалён', 'success');
      list.reload();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="База KPI организации"
        subtitle="Загрузите PDF, DOCX или XLSX с таблицами «Должность — Вид деятельности — Вес — Целевое значение». Таблицы разбираются построчно, без участия LLM, — обязательно сверьте разбор с оригиналом: именно по нему модель будет оценивать сотрудников."
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack gap={2}>
            <FileDropzone
              files={files}
              onChange={setFiles}
              accept=".pdf,.docx,.xlsx,.xlsm,.txt,.md"
              title="Перетащите документ организации"
              hint="PDF, DOCX, XLSX — или нажмите, чтобы выбрать"
              disabled={busy}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField size="small" label="Название (необязательно)" placeholder="Положение о KPI AITU 2023" value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1 }} />
              <Button variant="contained" disabled={!files.length || busy} onClick={upload} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
                {busy ? 'Разбор таблиц…' : 'Разобрать и сохранить'}
              </Button>
            </Stack>
            {lastWarnings.length > 0 && (
              <Alert severity="warning">
                <b>Предупреждения разбора:</b>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {lastWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </Box>
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Сохранённые каталоги
      </Typography>
      <Card sx={{ mb: 3 }}>
        {list.loading ? (
          <Skeleton variant="rounded" height={90} />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState icon={<LibraryBooksIcon fontSize="large" />} title="Каталогов пока нет">
            Загрузите документ организации выше.
          </EmptyState>
        ) : (
          <Table aria-label="Сохранённые каталоги">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Файлы</TableCell>
                <TableCell align="right">Должностей</TableCell>
                <TableCell align="right">Показателей</TableCell>
                <TableCell>Создан</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data.map((c) => (
                <TableRow key={c.id} hover selected={c.id === viewId}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{c.files.join(', ')}</Typography>
                  </TableCell>
                  <TableCell align="right">{c.positions_count}</TableCell>
                  <TableCell align="right">{c.indicators_count}</TableCell>
                  <TableCell>{formatDate(c.created_at)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Открыть разбор">
                      <IconButton aria-label={`Открыть ${c.name}`} onClick={() => open(c.id)}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton aria-label={`Удалить ${c.name}`} color="error" onClick={() => setToDelete(c.id)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {catalog && <CatalogViewer catalog={catalog} />}

      <ConfirmDialog open={Boolean(toDelete)} title="Удалить каталог?" text="Каталог будет удалён без возможности восстановления. Сохранённые оценки не изменятся." onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
