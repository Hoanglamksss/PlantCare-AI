import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, X } from 'lucide-react';
import { displayError, request, type Page, type Session } from './api';
import { ErrorNotice } from './ui';

type Notification = {
  id: string;
  title: string;
  body: string;
  plantId: string;
  createdAt: string;
  readAt: string | null;
};
type NotificationsPage = Page<Notification> & { unreadCount: number };

export function Notifications({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationsPage>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async (operation: (signal: AbortSignal) => Promise<void>) => {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await operation(controller.signal);
      if (!controller.signal.aborted) setError('');
    } catch (failure) {
      if (!controller.signal.aborted) setError(displayError(failure, onExpired));
    } finally {
      if (lifecycle.current === controller && !controller.signal.aborted) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [onExpired]);

  const refresh = useCallback(() => run(async (signal) => {
    const loaded = await request<NotificationsPage>('/notifications?limit=20', { signal });
    if (signal.aborted) return;
    setPage((current) => {
      if (!current?.items.length) return loaded;
      const recentIds = new Set(loaded.items.map((item) => item.id));
      // Without an overlapping item, a fresh cursor is needed to avoid skipping a gap.
      if (!current.items.some((item) => recentIds.has(item.id))) return loaded;
      return { ...loaded, items: [...loaded.items, ...current.items.filter((item) => !recentIds.has(item.id))], nextCursor: current.nextCursor };
    });
  }), [run]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    inFlight.current = false;
    setPage(undefined);
    setError('');
    void refresh();
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    const show = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', show);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', show);
      if (lifecycle.current === controller) lifecycle.current = null;
    };
  }, [session.user.id, session.csrfToken, refresh]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    }
    function key(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key); };
  }, [open]);

  async function readAll() {
    await run(async (signal) => {
      await request('/notifications/read-all', { method: 'PATCH', body: {}, csrfToken: session.csrfToken, signal });
      const loaded = await request<NotificationsPage>('/notifications?limit=20', { signal });
      if (!signal.aborted) setPage(loaded);
    });
  }

  async function more() {
    if (!page?.nextCursor) return;
    const cursor = page.nextCursor;
    await run(async (signal) => {
      const next = await request<NotificationsPage>(`/notifications?limit=20&cursor=${encodeURIComponent(cursor)}`, { signal });
      if (!signal.aborted) setPage((current) => {
        if (!current) return next;
        const known = new Set(current.items.map((item) => item.id));
        return { ...next, items: [...current.items, ...next.items.filter((item) => !known.has(item.id))] };
      });
    });
  }

  return <div className="notification-anchor" ref={anchor}>
    <button type="button" className="notification-button" aria-label={`Thông báo${page?.unreadCount ? `, ${page.unreadCount} chưa đọc` : ''}`}
      aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }}>
      <Bell size={19} strokeWidth={1.8} aria-hidden="true" />
      {!!page?.unreadCount && <span className="notification-badge">{page.unreadCount > 99 ? '99+' : page.unreadCount}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="Thông báo gần đây">
      <div className="notification-heading"><strong>Thông báo</strong>
        <button type="button" className="text-button" disabled={busy || !page?.unreadCount} onClick={() => void readAll()}>Đánh dấu đã đọc</button>
        <button type="button" className="button button-plain" aria-label="Đóng thông báo" onClick={() => setOpen(false)}><X size={16} /></button>
      </div>
      <ErrorNotice message={error} />
      {error && <button type="button" className="text-button" disabled={busy} onClick={() => void refresh()}>Tải lại thông báo</button>}
      {!page && !error && <p role="status">Đang tải thông báo…</p>}
      {page?.items.length === 0 && <p className="muted notification-empty">Chưa có nhắc việc. Bạn có thể tạo lịch chăm sóc cho cây.</p>}
      <div className="notification-list">{page?.items.map((item) => <a key={item.id} className={`notification-item${item.readAt ? '' : ' is-unread'}`}
        href={`#garden?plant=${item.plantId}`} onClick={() => setOpen(false)}>
        <span className="notification-item-icon"><CalendarClock size={17} aria-hidden="true" /></span>
        <span><strong>{item.title}</strong><small>{item.body}</small><small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small></span>
      </a>)}</div>
      {page?.nextCursor && <button className="text-button" type="button" disabled={busy} onClick={() => void more()}>Xem thêm</button>}
      <a href="#schedule" className="text-button" onClick={() => setOpen(false)}>Mở lịch chăm sóc</a>
    </section>}
  </div>;
}
