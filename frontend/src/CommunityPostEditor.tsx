import { useState, type FormEvent } from 'react';
import { Leaf } from 'lucide-react';
import { displayError, request, type Plant } from './api';
import { usePage } from './collections';
import { Dialog, ErrorNotice } from './ui';
import { CommunityMediaPicker } from './CommunityMedia';
import { localDateTime, type CommunityControls, type CommunityPost } from './communityTypes';

export function CommunityPostEditor({ post, initialPlant, csrfToken, onExpired, onDismiss, onSaved, onOpenGarden, onManageSharing }: CommunityControls & {
  post?: CommunityPost;
  initialPlant?: { id: string; nickname: string };
  onDismiss: () => void;
  onSaved: (post: CommunityPost) => void;
  onOpenGarden: () => void;
  onManageSharing?: () => void;
}) {
  const [plantId, setPlantId] = useState(post?.plantId ?? initialPlant?.id ?? '');
  const [title, setTitle] = useState(post?.title ?? initialPlant?.nickname ?? '');
  const [note, setNote] = useState(post?.note ?? '');
  const [happenedAt, setHappenedAt] = useState(localDateTime(post ? new Date(post.happenedAt) : new Date()));
  const [includeHistory, setIncludeHistory] = useState(post?.includeHistory ?? false);
  const [existing, setExisting] = useState(post?.photos ?? []);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!plantId) { setError('Hãy chọn cây trong vườn của bạn.'); return; }
    const date = new Date(happenedAt);
    if (Number.isNaN(date.getTime())) { setError('Hãy chọn ngày và giờ hợp lệ.'); return; }
    if (!title.trim()) { setError('Hãy nhập tiêu đề bài viết.'); return; }
    if (!note.trim() && !existing.length && !photos.length) { setError('Hãy viết ghi chú hoặc đính kèm ảnh.'); return; }
    const body = new FormData();
    if (!post) body.set('plantId', plantId);
    body.set('title', title.trim());
    body.set('note', note.trim());
    body.set('happenedAt', date.toISOString());
    body.set('includeHistory', String(includeHistory));
    if (post) body.set('retainedPhotoIds', JSON.stringify(existing.map((photo) => photo.id)));
    for (const photo of photos) body.append('images', photo);
    setBusy(true);
    setError('');
    try {
      const path = post ? `/community/posts/${encodeURIComponent(post.id)}` : '/community/posts';
      const saved = await request<CommunityPost>(path, { method: post ? 'PATCH' : 'POST', csrfToken, body });
      onSaved(saved);
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title={post ? 'Sửa bài viết' : 'Chia sẻ câu chuyện của cây'} busy={busy} onDismiss={onDismiss}>
    <div className="community-editor">
      <ErrorNotice message={error} />
      <form onSubmit={(event) => void save(event)}>
        <fieldset className="form-stack" disabled={busy}>
          {post || initialPlant ? <div className="community-selected-plant"><Leaf size={20} aria-hidden="true" /><span>{post ? `${post.plant.speciesName}${post.plant.archived ? ' · Đã lưu trữ' : ''}` : initialPlant?.nickname}</span></div>
            : <OwnPlantSelect value={plantId} onChange={setPlantId} onExpired={onExpired} onOpenGarden={onOpenGarden} />}
          <label className="field">Tiêu đề<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Một thay đổi nhỏ trong vườn…" /></label>
          <label className="field">Ngày và giờ<input name="happenedAt" type="datetime-local" required value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} /></label>
          <label className="field">Ghi chú<textarea name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} rows={4} placeholder="Kể về cây, cách chăm hoặc điều bạn đang băn khoăn…" /></label>
          <CommunityMediaPicker photos={photos} onPhotos={setPhotos} existing={existing} onExisting={setExisting} disabled={busy} onError={setError} />
          <p className="field-hint">Tối đa 4 ảnh JPEG, PNG hoặc WebP. Tổng dung lượng ảnh tối đa 8 MiB.</p>
          <div className="community-consent">
            <label className="checkbox-field"><input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} /> Cho thành viên xem cả nhật ký và lịch sử kiểm tra cây</label>
            <p>Gồm ghi chú, ảnh và kết quả hiện có, cùng nội dung được thêm vào cây sau này. Bạn có thể tắt chia sẻ trong hồ sơ cây.</p>
          </div>
          {onManageSharing && <button type="button" className="text-button" onClick={onManageSharing}>Quản lý quyền chia sẻ của cây</button>}
          <div className="form-actions"><button type="button" className="button button-secondary" onClick={onDismiss}>Hủy</button><button type="submit" className="button button-primary">{busy ? 'Đang lưu…' : post ? 'Lưu thay đổi' : 'Đăng bài'}</button></div>
        </fieldset>
      </form>
    </div>
  </Dialog>;
}

function OwnPlantSelect({ value, onChange, onExpired, onOpenGarden }: {
  value: string;
  onChange: (id: string) => void;
  onExpired: () => void;
  onOpenGarden: () => void;
}) {
  const [archived, setArchived] = useState(false);
  const { page, error, reload, loadingMore, loadMore } = usePage<Plant>(`/plants?archived=${archived}`, onExpired);
  const [selection, setSelection] = useState<Plant | null>(null);
  const selected = selection && selection.id === value ? selection : page?.items.find((plant) => plant.id === value);
  const options = page?.items ?? [];
  const hasSelected = options.some((plant) => plant.id === value);

  return <div className="community-own-plant">
    <p className="field">Cây của bạn <span className="field-hint">Bắt buộc chọn một cây để gắn với bài viết</span></p>
    <div className="filters"><button type="button" className="filter" aria-pressed={!archived} onClick={() => setArchived(false)}>Đang theo dõi</button><button type="button" className="filter" aria-pressed={archived} onClick={() => setArchived(true)}>Đã lưu trữ</button></div>
    <ErrorNotice message={error} />
    {!page && (error ? <button type="button" className="text-button" onClick={reload}>Thử tải cây lại</button> : <p className="muted" role="status">Đang tải cây…</p>)}
    {page && <label className="field"><span className="community-sr">Chọn cây cho bài viết</span><select required value={value} onChange={(event) => {
      const chosen = options.find((plant) => plant.id === event.target.value);
      setSelection(chosen ?? null);
      onChange(event.target.value);
    }}>
      <option value="">Chọn cây trong vườn</option>
      {selected && !hasSelected && <option value={selected.id}>{selected.nickname} · {selected.speciesName}</option>}
      {options.map((plant) => <option value={plant.id} key={plant.id}>{plant.nickname} · {plant.speciesName}</option>)}
    </select></label>}
    {page?.items.length === 0 && <button type="button" className="text-button" onClick={onOpenGarden}>Mở vườn để thêm cây</button>}
    {page?.nextCursor && <button type="button" className="text-button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Đang tải…' : 'Tải thêm cây để chọn'}</button>}
  </div>;
}
