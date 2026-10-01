import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import FileDropzone from './FileDropzone';
import { renderWithProviders } from '../test/render';

function Harness({ initial = [], disabled = false }) {
  const [files, setFiles] = useState(initial);
  return <FileDropzone files={files} onChange={setFiles} title="Перетащите файлы" hint="подсказка" accept=".txt" disabled={disabled} />;
}

const file = (name, content = 'x') => new File([content], name, { type: 'text/plain' });

describe('FileDropzone', () => {
  it('выбор файлов через input добавляет чипы', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.upload(screen.getByTestId('file-input'), [file('a.txt'), file('b.txt')]);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });

  it('drag&drop добавляет файлы, дубликаты игнорируются', () => {
    renderWithProviders(<Harness />);
    const zone = screen.getByTestId('dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [file('a.txt')] } });
    fireEvent.drop(zone, { dataTransfer: { files: [file('a.txt')] } });
    expect(screen.getAllByText('a.txt')).toHaveLength(1);
  });

  it('удаление файла по крестику', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={[file('a.txt'), file('b.txt', 'yy')]} />);
    const chip = screen.getByText('a.txt').closest('.MuiChip-root');
    await user.click(chip.querySelector('.MuiChip-deleteIcon'));
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });

  it('в отключённом состоянии drop игнорируется', () => {
    renderWithProviders(<Harness disabled />);
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file('a.txt')] } });
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
    expect(screen.getByTestId('dropzone')).toHaveAttribute('aria-disabled', 'true');
  });
});
