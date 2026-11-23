import { useEffect, useState } from 'react';
import { ApiError } from './api';

export function useEmailCodeCooldown(email: string) {
  const key = email.trim().toLowerCase();
  const [wait, setWait] = useState<{ key: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  const remaining = wait?.key === key ? Math.max(0, Math.ceil((wait.until - now) / 1000)) : 0;

  useEffect(() => {
    if (!wait) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= wait.until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  function start(seconds = 60) {
    const current = Date.now();
    setNow(current);
    setWait({ key, until: current + seconds * 1000 });
  }

  function handleLimit(error: unknown) {
    if (error instanceof ApiError && error.status === 429 && error.code === 'EMAIL_CODE_LIMIT') {
      start(error.retryAfter);
    }
  }

  return { remaining, start, handleLimit };
}
