import { useRef, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { alpha } from '@mui/material/styles';

export default function FileDropzone({ files, onChange, accept, title, hint, disabled = false }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const add = (list) => {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return;
    const known = new Set(files.map((f) => `${f.name}:${f.size}`));
    onChange([...files, ...incoming.filter((f) => !known.has(`${f.name}:${f.size}`))]);
  };

  return (
    <Box>
      <Box
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={title}
        aria-disabled={disabled}
        data-testid="dropzone"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        sx={(theme) => ({
          border: 2,
          borderStyle: 'dashed',
          borderColor: over ? 'primary.main' : 'divider',
          bgcolor: over ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all .15s',
          '&:hover': disabled ? {} : { borderColor: 'primary.main' },
          '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid' },
        })}
      >
        <CloudUploadIcon color="primary" sx={{ fontSize: 40 }} />
        <Typography variant="subtitle1">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={accept}
          data-testid="file-input"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </Box>
      {files.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
          {files.map((f) => (
            <Chip
              key={`${f.name}:${f.size}`}
              label={f.name}
              size="small"
              onDelete={disabled ? undefined : () => onChange(files.filter((x) => x !== f))}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
