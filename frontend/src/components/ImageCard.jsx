import { Box, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { api } from '../api';
import { BLUR_LABEL, IMAGE_LEVEL, TAMPER_RISK, truncate } from '../utils/format';

function Row({ label, children }) {
  return (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ width: 150, verticalAlign: 'top', border: 0, py: 0.75 }}>
        {label}
      </TableCell>
      <TableCell sx={{ border: 0, py: 0.75 }}>{children}</TableCell>
    </TableRow>
  );
}

export default function ImageCard({ submissionId, image }) {
  const verdict = image.verdict ?? {};
  const level = IMAGE_LEVEL[verdict.level] ?? { label: '—', color: 'default' };
  const integrity = image.integrity ?? {};
  const tamper = image.tamper;
  const blur = image.blur;
  const vision = image.vision;
  const risk = tamper ? TAMPER_RISK[tamper.risk] : null;
  const corrupt = integrity.status === 'corrupt';

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle1" noWrap title={image.filename}>
            {image.filename}
          </Typography>
          <Chip size="small" color={level.color} label={level.label} />
        </Stack>

        {!corrupt && (
          <Stack direction="row" gap={1} sx={{ mb: 1 }}>
            <Box
              component="img"
              alt={`Изображение ${image.filename}`}
              src={api.fileUrl(submissionId, image.filename)}
              sx={{ maxWidth: '48%', maxHeight: 170, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }}
            />
            {tamper?.ela_heatmap && (
              <Box
                component="img"
                alt="ELA-карта"
                title="ELA-карта: яркие области сжаты иначе"
                src={api.fileUrl(submissionId, tamper.ela_heatmap)}
                sx={{ maxWidth: '48%', maxHeight: 170, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }}
              />
            )}
          </Stack>
        )}

        <Table size="small">
          <TableBody>
            <Row label="Целостность">
              <Chip
                size="small"
                color={integrity.status === 'ok' ? 'success' : corrupt ? 'error' : 'warning'}
                label={integrity.status === 'ok' ? 'файл не повреждён' : corrupt ? 'повреждён' : 'замечания'}
              />{' '}
              <Typography variant="caption" color="text.secondary">
                {[integrity.format, integrity.width && `${integrity.width}×${integrity.height}`].filter(Boolean).join(' · ')}
              </Typography>
              {(integrity.problems ?? []).map((p) => (
                <Typography key={p} variant="caption" display="block">
                  • {p}
                </Typography>
              ))}
            </Row>
            {blur && (
              <Row label="Резкость">
                <Chip size="small" color={BLUR_LABEL[blur.label]?.color ?? 'default'} label={blur.text} />
              </Row>
            )}
            {tamper && (
              <Row label="Признаки монтажа">
                <Chip size="small" color={risk?.color ?? 'default'} label={risk?.label ?? tamper.risk} />
                {tamper.signals
                  .filter((s) => s.weight > 0)
                  .map((s) => (
                    <Typography key={s.text} variant="caption" display="block">
                      • {s.text}
                    </Typography>
                  ))}
              </Row>
            )}
            {vision && (
              <>
                <Row label="Что на изображении">
                  <Typography variant="body2">{vision.description}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Тип: {vision.document_type}
                  </Typography>
                </Row>
                {vision.extracted_text && (
                  <Row label="Текст (OCR)">
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
                      {truncate(vision.extracted_text, 600)}
                    </Typography>
                  </Row>
                )}
              </>
            )}
          </TableBody>
        </Table>
        {(image.errors ?? []).map((e) => (
          <Typography key={e} variant="caption" color="warning.main" display="block">
            {e}
          </Typography>
        ))}
        {tamper?.disclaimer && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            {tamper.disclaimer}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
