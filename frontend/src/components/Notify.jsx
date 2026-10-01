import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const NotifyContext = createContext(() => {});

export function NotifyProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const notify = useCallback((message, severity = 'info') => setMsg({ message, severity, key: Date.now() }), []);
  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        key={msg?.key}
        open={Boolean(msg)}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && setMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {msg ? (
          <Alert severity={msg.severity} variant="filled" onClose={() => setMsg(null)} sx={{ width: '100%' }}>
            {msg.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export const useNotify = () => useContext(NotifyContext);
