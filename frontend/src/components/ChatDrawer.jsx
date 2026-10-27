import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SendIcon from '@mui/icons-material/Send';
import ForumIcon from '@mui/icons-material/Forum';
import { api } from '../api';
import { quoteSpans, suggestQuestions } from '../utils/format';

const SECTION = /^\s*(?:\*\*)?(Ответ|Основание|Что изменило бы решение|Что изменить в отчёте|Что нужно изменить)(?:\*\*)?:(?:\*\*)?/;

function Bold({ text }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>));
}

function Quoted({ text, citations }) {
  const found = useMemo(() => new Map((citations ?? []).map((c) => [c.text, c.found])), [citations]);
  return quoteSpans(text).map((part, i) => {
    if (!part.quote) return <Bold key={i} text={part.text} />;
    const ok = found.get(part.quote);
    if (ok === undefined) return <span key={i}>«{part.quote}»</span>;
    return (
      <Tooltip key={i} title={ok ? 'Цитата найдена в материалах оценки' : 'Цитата не найдена в материалах — возможна неточность модели'}>
        <Box
          component="span"
          data-found={ok ? 'yes' : 'no'}
          sx={
            ok
              ? { bgcolor: 'success.main', color: 'success.contrastText', px: 0.4, borderRadius: 0.5, opacity: 0.9 }
              : { textDecoration: 'underline wavy', textDecorationColor: (t) => t.palette.error.main, color: 'error.main' }
          }
        >
          «{part.quote}»
        </Box>
      </Tooltip>
    );
  });
}

function Answer({ message }) {
  const lines = message.content.split('\n');
  const cites = message.citations ?? [];
  const ok = cites.filter((c) => c.found).length;
  return (
    <Box>
      {lines.map((line, i) => {
        const m = line.match(SECTION);
        return (
          <Typography key={i} variant="body2" component="div" sx={{ mt: m && i > 0 ? 1 : 0, minHeight: line ? undefined : 8 }}>
            {m ? (
              <>
                <b>{m[1]}:</b>
                <Quoted text={line.slice(m[0].length)} citations={cites} />
              </>
            ) : (
              <Quoted text={line} citations={cites} />
            )}
          </Typography>
        );
      })}
      <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap">
        {cites.length > 0 && (
          <Chip
            size="small"
            variant="outlined"
            color={ok === cites.length ? 'success' : 'warning'}
            label={`Цитаты проверены: ${ok} из ${cites.length}`}
          />
        )}
        {cites.length === 0 && <Chip size="small" variant="outlined" label="Без цитат — проверьте по протоколу" />}
        {message.elapsed != null && (
          <Typography variant="caption" color="text.secondary">
            ответ за {Math.round(message.elapsed)} с
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function focusLabel(focus, result) {
  if (!focus?.achievement_id) return null;
  for (const b of result?.blocks ?? []) {
    const m = b.matches.find((x) => x.achievement_id === focus.achievement_id && (!focus.indicator_id || x.indicator_id === focus.indicator_id));
    if (m) return `${m.achievement_id} → показатель ${m.indicator_num} («${b.title}»)`;
  }
  return focus.achievement_id;
}

export default function ChatDrawer({ open, onClose, submission, seed }) {
  const id = submission.id;
  const result = submission.result;
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [prevSeed, setPrevSeed] = useState(null);
  const bottom = useRef(null);
  const suggestions = useMemo(() => suggestQuestions(result), [result]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    api
      .getChat(id)
      .then((r) => {
        if (!alive) return;
        setMessages(r.messages);
        setModel(r.model ?? '');
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, id]);

  if (seed !== prevSeed) {
    setPrevSeed(seed);
    if (seed) {
      setInput(seed.question ?? '');
      setFocus(seed.focus ?? null);
    }
  }

  useEffect(() => {
    if (!sending) return undefined;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [sending]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setError(null);
    setSeconds(0);
    setSending(true);
    const before = messages;
    setMessages([...before, { role: 'user', content: message, focus, pending: true }]);
    setInput('');
    try {
      const r = await api.sendChat(id, { message, focus });
      setMessages(r.messages);
      setFocus(null);
    } catch (e) {
      setMessages(before);
      setInput(message);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    try {
      await api.clearChat(id);
      setMessages([]);
    } catch (e) {
      setError(e.message);
    }
  };

  const focusText = focusLabel(focus, result);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 540 } } } }}>
      <Stack sx={{ height: '100%' }} role="dialog" aria-label="Диалог с моделью-оценщиком">
        <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1.5 }}>
          <ForumIcon color="primary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1">Диалог с моделью-оценщиком</Typography>
            <Typography variant="caption" color="text.secondary">
              {model ? `${model} · ` : ''}отвечает только по протоколу решения и документам, цитаты проверяет программа
            </Typography>
          </Box>
          <Tooltip title="Очистить диалог">
            <span>
              <IconButton onClick={clear} disabled={!messages.length || sending} aria-label="Очистить диалог">
                <DeleteSweepIcon />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton onClick={onClose} aria-label="Закрыть диалог">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Divider />

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>
          {messages.length === 0 && !sending && (
            <Stack gap={1.5}>
              <Typography variant="body2" color="text.secondary">
                Спросите модель, почему она приняла решение. Она ответит со ссылками на Положение, отчёт и протокол проверки и скажет, что
                изменило бы вердикт. Изменить вердикт в диалоге нельзя — только дополнить документы и пересчитать.
              </Typography>
              <Stack direction="row" gap={1} flexWrap="wrap">
                {suggestions.map((q) => (
                  <Chip key={q} label={q} onClick={() => send(q)} variant="outlined" color="primary" sx={{ height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
                ))}
              </Stack>
            </Stack>
          )}
          <Stack gap={1.5}>
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <Box key={i} sx={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                  {m.focus?.achievement_id && (
                    <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
                      о решении {focusLabel(m.focus, result)}
                    </Typography>
                  )}
                  <Paper sx={{ px: 1.5, py: 1, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }} data-testid="chat-user">
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </Typography>
                  </Paper>
                </Box>
              ) : (
                <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 1.25, maxWidth: '95%', borderRadius: 2 }} data-testid="chat-answer">
                  <Answer message={m} />
                </Paper>
              ),
            )}
            {sending && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Модель изучает протокол решения… {seconds} с
                </Typography>
                <LinearProgress sx={{ mt: 0.5 }} />
              </Box>
            )}
            <div ref={bottom} />
          </Stack>
        </Box>

        <Divider />
        <Box sx={{ p: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {focusText && (
            <Chip size="small" color="primary" variant="outlined" label={`Вопрос о решении: ${focusText}`} onDelete={() => setFocus(null)} sx={{ mb: 1, maxWidth: '100%' }} />
          )}
          <Stack direction="row" gap={1} alignItems="flex-end">
            <TextField
              fullWidth
              multiline
              maxRows={6}
              size="small"
              placeholder="Почему модель приняла такое решение?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Вопрос модели' } }}
            />
            <IconButton color="primary" onClick={() => send()} disabled={!input.trim() || sending} aria-label="Отправить вопрос">
              <SendIcon />
            </IconButton>
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  );
}
