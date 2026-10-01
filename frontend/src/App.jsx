import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppShell from './components/AppShell';
import { NotifyProvider } from './components/Notify';
import { ThemeModeProvider } from './theme/ThemeModeProvider';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CatalogsPage = lazy(() => import('./pages/CatalogsPage'));
const EvaluatePage = lazy(() => import('./pages/EvaluatePage'));
const SubmissionPage = lazy(() => import('./pages/SubmissionPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));

function NotFound() {
  return <Box sx={{ py: 8, textAlign: 'center' }}>Страница не найдена</Box>;
}

const Loading = (
  <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
    <CircularProgress aria-label="Загрузка" />
  </Box>
);

export default function App() {
  return (
    <ThemeModeProvider>
      <NotifyProvider>
        <Suspense fallback={Loading}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="catalogs" element={<CatalogsPage />} />
              <Route path="evaluate" element={<EvaluatePage />} />
              <Route path="submissions/:id" element={<SubmissionPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </NotifyProvider>
    </ThemeModeProvider>
  );
}
