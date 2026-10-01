import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Chip,
  IconButton,
  InputAdornment,
  Skeleton,
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotify } from '../components/Notify';
import { ConfirmDialog, EmptyState, PageHeader, StatusChip } from '../components/common';
import { formatDate, kpiColor } from '../utils/format';

export default function HistoryPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const list = useApi(api.listSubmissions, []);
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    const all = list.data ?? [];
    if (!q) return all;
    return all.filter((s) => [s.employee, s.position, s.files.join(' ')].some((v) => (v ?? '').toLocaleLowerCase('ru').includes(q)));
  }, [list.data, query]);

  const remove = async () => {
    const id = toDelete;
    setToDelete(null);
    try {
      await api.deleteSubmission(id);
      notify('Оценка удалена', 'success');
      list.reload();
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="История оценок"
        subtitle="Все выполненные проверки. Результат можно открыть, выгрузить в Excel или удалить."
        actions={
          <TextField
            size="small"
            placeholder="Поиск: ФИО, должность, файл"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              htmlInput: { 'aria-label': 'Поиск по истории' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        }
      />
      <Card>
        {list.loading ? (
          <Skeleton variant="rounded" height={140} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<HistoryIcon fontSize="large" />} title={query ? 'Ничего не найдено' : 'Пока пусто'}>
            {query ? 'Измените запрос поиска.' : 'Результаты появятся после первой оценки.'}
          </EmptyState>
        ) : (
          <Table aria-label="История оценок">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Сотрудник</TableCell>
                <TableCell>Должность</TableCell>
                <TableCell>Файлы</TableCell>
                <TableCell>KPI</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{formatDate(s.created_at)}</TableCell>
                  <TableCell>{s.employee || '—'}</TableCell>
                  <TableCell>{s.position || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{s.files.join(', ')}</Typography>
                  </TableCell>
                  <TableCell>{s.kpi != null ? <Chip size="small" color={kpiColor(s.kpi)} label={`${s.kpi}%`} /> : '—'}</TableCell>
                  <TableCell>
                    <StatusChip status={s.status} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Открыть">
                      <IconButton aria-label={`Открыть оценку ${s.id}`} onClick={() => navigate(`/submissions/${s.id}`)}>
                        <OpenInNewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton aria-label={`Удалить оценку ${s.id}`} color="error" onClick={() => setToDelete(s.id)}>
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
      <ConfirmDialog open={Boolean(toDelete)} title="Удалить результат?" text="Результат и загруженные файлы будут удалены без возможности восстановления." onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
