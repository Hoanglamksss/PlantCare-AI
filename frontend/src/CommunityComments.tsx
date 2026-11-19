import { useState, type FormEvent } from 'react';
import { Heart, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { displayError, request } from './api';
import { usePage } from './collections';
import { ErrorNotice } from './ui';
import { CommunityMediaPicker, CommunityPhotos } from './CommunityMedia';
import { communityDateTime, type CommunityComment, type CommunityControls } from './communityTypes';

export function CommunityComments({ postId, csrfToken, onExpired, onChanged, readOnly = false }: CommunityControls & {
  postId: string;
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const [version, setVersion] = useState(0);
  return <section className="community-comment-section" aria-labelledby="community-comments-title">
    <h2 id="community-comments-title">Cùng trao đổi</h2>
    {!readOnly && <CommentComposer postId={postId} csrfToken={csrfToken} onExpired={onExpired} onSent={() => {
      setVersion((value) => value + 1);
      onChanged();
    }} />}
    <CommentCollection key={version} postId={postId} csrfToken={csrfToken} onExpired={onExpired} onChanged={onChanged} depth={0} readOnly={readOnly} />
  </section>;
}

function CommentCollection({ postId, parentId, depth, csrfToken, onExpired, onChanged, onChildRemoved, readOnly }: CommunityControls & {
  postId: string;
  parentId?: string;
  depth: number;
  onChanged: () => void;
  onChildRemoved?: () => void;
  readOnly: boolean;
}) {
  const path = `/community/posts/${postId}/comments${parentId ? `?parentId=${parentId}` : ''}`;
  const { page, error, reload, loadMore, loadingMore } = usePage<CommunityComment>(path, onExpired);
  return <div className="community-comment-collection">
    <ErrorNotice message={error} />
    {!page && (error ? <button type="button" className="text-button" onClick={reload}>Thử tải lại</button> : <p className="muted" role="status">Đang tải bình luận…</p>)}
    {page?.items.length === 0 && <p className="muted">{parentId ? 'Chưa có phản hồi.' : 'Chưa có bình luận. Hãy bắt đầu câu chuyện về cây.'}</p>}
    {page && <ul className="community-comment-list">{page.items.map((comment) => <CommentBranch key={comment.id} comment={comment} postId={postId} depth={depth} csrfToken={csrfToken} onExpired={onExpired} onChanged={onChanged} readOnly={readOnly} onRemoved={() => {
      reload();
      onChildRemoved?.();
      onChanged();
    }} />)}</ul>}
    {page?.nextCursor && <button type="button" className="text-button community-load-comments" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Đang tải…' : 'Xem thêm bình luận'}</button>}
  </div>;
}

function CommentBranch({ comment, postId, depth, csrfToken, onExpired, onChanged, onRemoved, readOnly }: CommunityControls & {
  comment: CommunityComment;
  postId: string;
  depth: number;
  onChanged: () => void;
  onRemoved: () => void;
  readOnly: boolean;
}) {
  const [likes, setLikes] = useState({ liked: comment.liked, likeCount: comment.likeCount });
  const [replies, setReplies] = useState(comment.replyCount);
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyVersion, setReplyVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `/community/posts/${postId}/comments/${comment.id}`;

  async function like() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setLikes(await request<typeof likes>(`${path}/like`, { method: 'PUT', csrfToken, body: { liked: !likes.liked } }));
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally { setBusy(false); }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await request(path, { method: 'DELETE', csrfToken });
      onRemoved();
    } catch (failure) {
      setError(displayError(failure, onExpired));
      setBusy(false);
    }
  }

  return <li className="community-comment-branch">
    <article className="community-comment-card">
      <header className="community-comment-header"><div><strong>{comment.author}</strong><time dateTime={comment.createdAt}>{communityDateTime.format(new Date(comment.createdAt))}</time></div>
        {comment.canDelete && !readOnly && <button type="button" className="community-icon-button" aria-label="Xóa bình luận" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" /></button>}
      </header>
      {comment.moderationHidden && <p className="community-moderation">Bình luận này đang được quản trị viên ẩn.</p>}
      {comment.body && <p className="community-comment-body">{comment.body}</p>}
      <CommunityPhotos photos={comment.photos} compact />
      <div className="community-comment-tools">
        <button type="button" aria-pressed={likes.liked} disabled={busy || readOnly || comment.moderationHidden} onClick={() => void like()}><Heart size={16} aria-hidden="true" fill={likes.liked ? 'currentColor' : 'none'} /> {likes.likeCount ? `${likes.likeCount} thích` : 'Thích'}</button>
        {!readOnly && !comment.moderationHidden && <button type="button" disabled={busy} onClick={() => setReplying((value) => !value)}><MessageCircle size={16} aria-hidden="true" /> Trả lời</button>}
        {replies > 0 && <button type="button" aria-expanded={showReplies} disabled={busy} onClick={() => setShowReplies((value) => !value)}>{showReplies ? 'Ẩn phản hồi' : `Xem ${replies} phản hồi`}</button>}
      </div>
      {confirmDelete && <div className="community-delete"><span>Xóa bình luận và các phản hồi bên dưới?</span><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(false)}>Giữ lại</button><button type="button" className="text-button community-delete-action" disabled={busy} onClick={() => void remove()}>{busy ? 'Đang xóa…' : 'Xóa'}</button></div>}
      <ErrorNotice message={error} />
    </article>
    {replying && !readOnly && <CommentComposer postId={postId} parentId={comment.id} replyingTo={comment.author} csrfToken={csrfToken} onExpired={onExpired} onCancel={() => setReplying(false)} onSent={() => {
      setReplying(false);
      setShowReplies(true);
      setReplies((value) => value + 1);
      setReplyVersion((value) => value + 1);
      onChanged();
    }} />}
    {showReplies && <div className="community-thread" data-deep={depth >= 2}>
      <CommentCollection key={replyVersion} postId={postId} parentId={comment.id} depth={depth + 1} csrfToken={csrfToken} onExpired={onExpired} onChanged={onChanged} readOnly={readOnly} onChildRemoved={() => setReplies((value) => Math.max(0, value - 1))} />
    </div>}
  </li>;
}

function CommentComposer({ postId, parentId, replyingTo, csrfToken, onExpired, onSent, onCancel }: CommunityControls & {
  postId: string;
  parentId?: string;
  replyingTo?: string;
  onSent: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!body.trim() && !photos.length)) return;
    const data = new FormData();
    data.set('body', body.trim());
    if (parentId) data.set('parentId', parentId);
    for (const photo of photos) data.append('images', photo);
    setBusy(true);
    setError('');
    try {
      await request(`/community/posts/${postId}/comments`, { method: 'POST', csrfToken, body: data });
      setBody('');
      setPhotos([]);
      onSent();
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally { setBusy(false); }
  }

  return <form className="community-comment-composer" onSubmit={(event) => void send(event)}>
    <fieldset disabled={busy} className="form-stack">
      {replyingTo && <div className="community-reply-target"><span>Trả lời {replyingTo}</span><button type="button" className="community-icon-button" aria-label="Hủy trả lời" onClick={onCancel}><X size={16} aria-hidden="true" /></button></div>}
      <label className="field"><span>{parentId ? 'Phản hồi của bạn' : 'Bình luận của bạn'}</span><textarea rows={2} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Chia sẻ kinh nghiệm hoặc gửi ảnh cây của bạn…" /></label>
      <CommunityMediaPicker photos={photos} onPhotos={setPhotos} disabled={busy} onError={setError} />
      <ErrorNotice message={error} />
      <div className="form-actions">{onCancel && <button type="button" className="button button-secondary" onClick={onCancel}>Hủy</button>}<button type="submit" className="button button-primary" disabled={!body.trim() && !photos.length}><Send size={16} aria-hidden="true" />{busy ? 'Đang gửi…' : 'Gửi'}</button></div>
    </fieldset>
  </form>;
}
