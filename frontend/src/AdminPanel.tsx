import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { displayError, request, type Session } from './api';
import { usePage } from './collections';
import { Dialog, ErrorNotice } from './ui';
import './admin.css';

type Account = { id: string; email: string; displayName: string | null; phone: string | null; role: 'user' | 'admin'; disabled: boolean };
type Post = { id: string; plantId: string; title: string; note: string; author: string; email: string; createdAt: string; hidden: boolean };
type Controls = { session: Session; onExpired: () => void };
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

function useActionController(session: Session) {
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    return () => controller.abort();
  }, [session.user.id, session.csrfToken]);
  return active;
}

export function AdminPanel(controls: Controls) {
  const [tab, setTab] = useState<'accounts' | 'posts'>('accounts');
  return <section className="admin-page" aria-labelledby="admin-title">
    <a href="#profile" className="admin-back"><ArrowLeft size={17} aria-hidden="true" /> Hồ sơ</a>
    <header className="page-heading"><div><h1 id="admin-title">Quản trị</h1><p className="muted">Quản lý tài khoản và nội dung được chia sẻ.</p></div><ShieldCheck size={30} aria-hidden="true" /></header>
    <div className="filters" aria-label="Mục quản trị">
      <button className="filter" aria-pressed={tab === 'accounts'} onClick={() => setTab('accounts')}><UsersRound size={16} aria-hidden="true" /> Tài khoản</button>
      <button className="filter" aria-pressed={tab === 'posts'} onClick={() => setTab('posts')}><Eye size={16} aria-hidden="true" /> Bài viết</button>
    </div>
    {tab === 'accounts' ? <Accounts {...controls} /> : <Posts {...controls} />}
  </section>;
}

function AdminSearch({ label, onSearch }: { label: string; onSearch: (value: string) => void }) {
  const [query, setQuery] = useState('');
  function search(event: FormEvent) { event.preventDefault(); onSearch(query.trim()); }
  return <form className="admin-search" onSubmit={search}>
    <label className="field"><span className="sr-only">{label}</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder={label} type="search" /></label>
    <button className="button button-secondary" type="submit"><Search size={17} aria-hidden="true" /> Tìm</button>
  </form>;
}

function Accounts({ session, onExpired }: Controls) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useActionController(session);
  const { page, error, reload, loadMore, loadingMore } = usePage<Account>(`/admin/accounts?limit=20&search=${encodeURIComponent(search)}`, onExpired);
  async function save() {
    const signal = action.current?.signal;
    if (!selected || busy || !signal || signal.aborted || selected.id === session.user.id) return;
    setBusy(true); setActionError('');
    try {
      await request(`/admin/accounts/${selected.id}`, { method: 'PATCH', csrfToken: session.csrfToken, body: { disabled: !selected.disabled }, signal });
      if (signal.aborted) return;
      setNotice(selected.disabled ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản và thu hồi các phiên đăng nhập.');
      setSelected(null); reload();
    } catch (failure) { if (!signal.aborted) setActionError(displayError(failure, onExpired)); } finally { if (!signal.aborted) setBusy(false); }
  }
  return <>
    <AdminSearch label="Tìm email hoặc tên hiển thị" onSearch={setSearch} />
    {notice && <p className="notice" role="status">{notice}</p>}
    <ErrorNotice message={error} />
    {!page && (error ? <button className="button button-secondary" onClick={reload}>Thử lại</button> : <p role="status">Đang tải tài khoản…</p>)}
    {page && <div className="admin-table-wrap"><table>
      <caption className="sr-only">Danh sách tài khoản</caption>
      <thead><tr><th scope="col">Tài khoản</th><th scope="col">Liên hệ</th><th scope="col">Quyền</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
      <tbody>{page.items.map((account) => <tr key={account.id}>
        <td><strong>{account.displayName || 'Chưa đặt tên'}</strong><small>{account.email}</small></td>
        <td>{account.phone || 'Chưa cập nhật'}</td><td>{account.role === 'admin' ? 'Admin' : 'User'}</td>
        <td><span className="admin-status" data-disabled={account.disabled}>{account.disabled ? 'Đã khóa' : 'Đang hoạt động'}</span></td>
        <td><button className="text-button" disabled={account.id === session.user.id} onClick={() => { setSelected(account); setActionError(''); }}>{account.disabled ? 'Mở khóa' : 'Khóa tài khoản'}</button></td>
      </tr>)}</tbody>
    </table>{!page.items.length && <p className="admin-empty">Không tìm thấy tài khoản phù hợp.</p>}</div>}
    {page?.nextCursor && <button className="button button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Đang tải…' : 'Xem thêm'}</button>}
    {selected && <Dialog title={selected.disabled ? 'Mở khóa tài khoản' : 'Khóa tài khoản'} busy={busy} onDismiss={() => setSelected(null)}>
      <p className="admin-confirm-copy">{selected.email}{selected.disabled ? ' sẽ có thể đăng nhập trở lại.' : ' sẽ bị thu hồi các phiên đăng nhập và tạm ngừng truy cập.'}</p>
      <ErrorNotice message={actionError} />
      <div className="form-actions"><button className="button button-secondary" disabled={busy} onClick={() => setSelected(null)}>Hủy</button><button className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button></div>
    </Dialog>}
  </>;
}

function Posts({ session, onExpired }: Controls) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useActionController(session);
  const { page, error, reload, loadMore, loadingMore } = usePage<Post>(`/admin/posts?limit=20&search=${encodeURIComponent(search)}`, onExpired);
  async function save() {
    const signal = action.current?.signal;
    if (!selected || busy || !signal || signal.aborted) return;
    setBusy(true); setActionError('');
    try {
      await request(`/admin/posts/${selected.id}`, { method: 'PATCH', csrfToken: session.csrfToken, body: { hidden: !selected.hidden }, signal });
      if (signal.aborted) return;
      setNotice(selected.hidden ? 'Đã bỏ trạng thái ẩn của bài viết.' : 'Đã ẩn bài viết khỏi cộng đồng.');
      setSelected(null); reload();
    } catch (failure) { if (!signal.aborted) setActionError(displayError(failure, onExpired)); } finally { if (!signal.aborted) setBusy(false); }
  }
  return <>
    <AdminSearch label="Tìm bài viết hoặc người đăng" onSearch={setSearch} />
    {notice && <p className="notice" role="status">{notice}</p>}
    <ErrorNotice message={error} />
    {!page && (error ? <button className="button button-secondary" onClick={reload}>Thử lại</button> : <p role="status">Đang tải bài viết…</p>)}
    <div className="admin-posts">{page?.items.map((post) => <article className="admin-post" key={post.id}>
      <header><div><h2>{post.title}</h2><p>{post.author} · {post.email}</p></div><span className="admin-status" data-disabled={post.hidden}>{post.hidden ? 'Đã ẩn' : 'Hiển thị'}</span></header>
      <p className="admin-post-note">{post.note || 'Bài viết có ảnh.'}</p>
      <footer><time dateTime={post.createdAt}>{dateTime.format(new Date(post.createdAt))}</time><button className="button button-secondary" onClick={() => { setSelected(post); setActionError(''); }}>{post.hidden ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}{post.hidden ? 'Bỏ ẩn' : 'Ẩn bài viết'}</button></footer>
    </article>)}</div>
    {page?.items.length === 0 && <p className="admin-empty">Không tìm thấy bài viết phù hợp.</p>}
    {page?.nextCursor && <button className="button button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Đang tải…' : 'Xem thêm'}</button>}
    {selected && <Dialog title={selected.hidden ? 'Bỏ ẩn bài viết' : 'Ẩn bài viết'} busy={busy} onDismiss={() => setSelected(null)}>
      <p className="admin-confirm-copy">{selected.title}</p><ErrorNotice message={actionError} />
      <div className="form-actions"><button className="button button-secondary" disabled={busy} onClick={() => setSelected(null)}>Hủy</button><button className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button></div>
    </Dialog>}
  </>;
}
