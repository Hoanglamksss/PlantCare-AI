import { useCallback, useEffect, useRef, useState } from 'react';
import { displayError, request } from './api';
import type { Page } from './api';

export function usePage<T>(path: string, onExpired: () => void) {
  const [page, setPage] = useState<Page<T> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController>(null);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setPage(null);
    setError('');
    setLoadingMore(false);
    void request<Page<T>>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(displayError(failure, onExpired));
      });
    return () => controller.abort();
  }, [path, onExpired, revision]);

  async function loadMore() {
    const signal = active.current?.signal;
    if (!page?.nextCursor || !signal || signal.aborted || loadingMore) return;
    const separator = path.includes('?') ? '&' : '?';
    setLoadingMore(true);
    setError('');
    try {
      const result = await request<Page<T>>(`${path}${separator}cursor=${encodeURIComponent(page.nextCursor)}`, { signal });
      if (!signal.aborted) setPage({ items: [...page.items, ...result.items], nextCursor: result.nextCursor });
    } catch (failure) {
      if (!signal.aborted) setError(displayError(failure, onExpired));
    } finally {
      if (!signal.aborted) setLoadingMore(false);
    }
  }

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { page, error, loadingMore, loadMore, reload };
}
