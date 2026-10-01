import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((error) => !cancelled && setState((s) => ({ ...s, error })));
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, loading: state.data === undefined && !state.error, reload };
}

export function useHealth(interval = 20000) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const data = await api.health();
        if (!cancelled) setState({ data, error: null });
      } catch (error) {
        if (!cancelled) setState({ data: null, error });
      }
      if (!cancelled) timer = setTimeout(load, interval);
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [interval]);
  return state;
}

export function useSubmission(id, interval = 2500) {
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const data = await api.getSubmission(id);
        if (cancelled) return;
        setState({ data, error: null });
        if (data.status === 'queued' || data.status === 'running') timer = setTimeout(load, interval);
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, error }));
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, interval, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
