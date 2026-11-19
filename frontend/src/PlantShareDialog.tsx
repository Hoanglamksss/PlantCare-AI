import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { displayError, request } from './api';
import { Dialog, ErrorNotice } from './ui';
import { CommunityPostEditor } from './CommunityPostEditor';
import './community.css';

type ShareState = { shared: boolean; title: string | null; caption: string | null; includeHistory: boolean };

type PlantShareDialogProps = {
  plantId: string;
  suggestedTitle?: string;
  csrfToken: string;
  onExpired: () => void;
  onDismiss: () => void;
  onSaved: (shared: boolean) => void;
};

export function PlantShareDialog(props: PlantShareDialogProps) {
  const [mode, setMode] = useState<'post' | 'settings'>('post');
  if (mode === 'settings') return <PlantShareSettings {...props} onCompose={() => setMode('post')} />;
  return <CommunityPostEditor
    initialPlant={{ id: props.plantId, nickname: props.suggestedTitle ?? 'Cây của tôi' }}
    csrfToken={props.csrfToken}
    onExpired={props.onExpired}
    onDismiss={props.onDismiss}
    onSaved={() => props.onSaved(true)}
    onOpenGarden={props.onDismiss}
    onManageSharing={() => setMode('settings')}
  />;
}

function PlantShareSettings({ plantId, suggestedTitle, csrfToken, onExpired, onDismiss, onSaved, onCompose }: PlantShareDialogProps & { onCompose: () => void }) {
  const path = `/plants/${encodeURIComponent(plantId)}/share`;
  const [sharing, setSharing] = useState<ShareState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request<ShareState>(path, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setSharing(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(displayError(failure, onExpired));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [path, onExpired, version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharing) return;
    const body = sharing.shared
      ? {
        shared: true,
        title: sharing.title?.trim() ?? '',
        caption: sharing.caption?.trim() ?? null,
        includeHistory: sharing.includeHistory,
      }
      : { shared: false };
    setBusy(true);
    setError('');
    try {
      const result = await request<ShareState>(path, { method: 'PUT', csrfToken, body });
      onSaved(result.shared);
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title="Quyền chia sẻ của cây" busy={busy} onDismiss={onDismiss}>
    <p className="muted section-copy">Tắt chia sẻ để ẩn tất cả bài viết và nội dung của cây khỏi cộng đồng. Bài viết cũ vẫn được giữ để bạn quản lý.</p>
    <button type="button" className="button button-secondary" disabled={busy} onClick={onCompose}>Viết bài kèm ảnh</button>
    <ErrorNotice message={error} />
    {loading && <p role="status">Đang tải cài đặt chia sẻ…</p>}
    {!loading && !sharing && <button className="button button-secondary" onClick={() => setVersion((value) => value + 1)}>Thử lại</button>}
    {!loading && sharing && <form onSubmit={(event) => void save(event)}>
      <fieldset className="form-stack" disabled={busy}>
        <label className="checkbox-field"><input type="checkbox" checked={sharing.shared} onChange={(event) => setSharing({ ...sharing, shared: event.target.checked })} /> Cho phép chia sẻ cây với cộng đồng</label>
        {sharing.shared && <>
          <div className="field">
            <label className="field">Tiêu đề công khai<input name="title" value={sharing.title ?? ''} onChange={(event) => setSharing({ ...sharing, title: event.target.value })} required maxLength={80} /></label>
            {suggestedTitle && !sharing.title?.trim() && <button type="button" className="text-button" onClick={() => setSharing({ ...sharing, title: suggestedTitle })}>Dùng tên của cây</button>}
          </div>
          <label className="field">Lời giới thiệu<textarea name="caption" value={sharing.caption ?? ''} onChange={(event) => setSharing({ ...sharing, caption: event.target.value })} rows={3} maxLength={1000} /></label>
          <div>
            <label className="checkbox-field"><input type="checkbox" checked={sharing.includeHistory} onChange={(event) => setSharing({ ...sharing, includeHistory: event.target.checked })} /> Chia sẻ cả nhật ký, ảnh và kết quả kiểm tra</label>
            <p className="field-hint">Thành viên xem được nội dung hiện có và nội dung bạn thêm vào cây sau này. Bạn có thể tắt quyền này bất cứ lúc nào.</p>
          </div>
        </>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={onDismiss}>Hủy</button><button type="submit" className="button button-primary">{busy ? 'Đang lưu…' : 'Lưu chia sẻ'}</button></div>
      </fieldset>
    </form>}
  </Dialog>;
}
