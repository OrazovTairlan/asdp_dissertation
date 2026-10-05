import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotifyProvider } from '../components/Notify';
import { ThemeModeProvider } from '../theme/ThemeModeProvider';

export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeModeProvider>
        <NotifyProvider>{ui}</NotifyProvider>
      </ThemeModeProvider>
    </MemoryRouter>,
  );
}
