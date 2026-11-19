import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Leaf, MessageCircle, Pencil, Plus, Sprout, Trash2 } from 'lucide-react';
import { displayError, request } from './api';
import { usePage } from './collections';
import { Dialog, ErrorNotice } from './ui';
import { CommunityComments } from './CommunityComments';
import { CommunityPhotos } from './CommunityMedia';
import { CommunityPlantHistory } from './CommunityPlantHistory';
import { CommunityPostEditor } from './CommunityPostEditor';
import { CommunityReactions } from './CommunityReactions';
import { communityDateTime, type CommunityControls, type CommunityPost } from './communityTypes';
import './community.css';

type DetailTab = 'post' | 'notes' | 'diagnoses';
const detailTabs = { post: 'Bài viết', notes: 'Nhật ký cây', diagnoses: 'Kiểm tra cây' } as const;

export function Community({ csrfToken, onExpired, onNavigate }: CommunityControls & { onNavigate: (page: 'garden') => void }) {
  const [mine, setMine] = useState(false);
  const feed = usePage<CommunityPost>(`/community/posts?mine=${mine}`, onExpired);
  const [selected, setSelected] = useState<{ id: string; tab: DetailTab } | null>(null);
  const [editor, setEditor] = useState<{ post?: CommunityPost } | null>(null);
  const [notice, setNotice] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const controls = { csrfToken, onExpired };

  function saved(post: CommunityPost) {
    setEditor(null);
    setNotice('Đã lưu bài viết.');
    setSelected({ id: post.id, tab: 'post' });
    setDetailRevision((value) => value + 1);
    feed.reload();
  }

  return <section className="community" aria-label="Góc xanh">
    {selected ? <CommunityPostDetail key={selected.id} {...controls} postId={selected.id} initialTab={selected.tab} revision={detailRevision} onEdit={(post) => setEditor({ post })} onBack={() => {
      setSelected(null);
      feed.reload();
    }} onDeleted={() => {
      setSelected(null);
      setNotice('Đã xóa bài viết.');
      feed.reload();
    }} /> : <>
      <div className="community-heading">
        <div><h1 id="community-heading">Góc xanh</h1><p>Chia sẻ câu chuyện của cây, cùng nhau chăm vườn.</p></div>
        <button type="button" className="community-add" aria-label="Tạo bài viết" onClick={() => { setNotice(''); setEditor({}); }}><Plus size={23} aria-hidden="true" /><span>Bài viết mới</span></button>
      </div>
      <div className="community-feed-filters" aria-label="Lọc bài viết"><button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>Mới chia sẻ</button><button type="button" aria-pressed={mine} onClick={() => setMine(true)}>Bài của tôi</button></div>
      <button type="button" className="community-compose-prompt" onClick={() => { setNotice(''); setEditor({}); }}><span className="community-avatar" aria-hidden="true"><Sprout size={23} /></span><span>Hôm nay cây của bạn có gì mới?</span><ChevronRight size={18} aria-hidden="true" /></button>
      {notice && <p className="notice" role="status">{notice}</p>}
      <ErrorNotice message={feed.error} />
      {!feed.page && (feed.error ? <button type="button" className="button button-secondary" onClick={feed.reload}>Thử tải lại</button> : <p className="muted" role="status">Đang tải bài viết…</p>)}
      {feed.page?.items.length === 0 && <div className="empty-state community-empty"><span className="community-empty-icon" aria-hidden="true"><Sprout size={29} /></span><h2>{mine ? 'Viết câu chuyện đầu tiên của bạn' : 'Một góc xanh đang đợi'}</h2><p className="muted">Chọn cây, ghi lại một ngày và chia sẻ những bức ảnh của vườn.</p><button type="button" className="button button-primary" onClick={() => setEditor({})}>Tạo bài viết</button></div>}
      {feed.page && <ul className="community-grid" aria-label="Bài viết cộng đồng">{feed.page.items.map((post) => <li key={post.id}>
        <article className="community-card">
          <PostAuthor post={post} onEdit={post.isOwner ? () => setEditor({ post }) : undefined} />
          <button type="button" className="community-post-content" onClick={() => setSelected({ id: post.id, tab: 'post' })}>
            <h2>{post.title}</h2>{post.note && <p className="community-caption">{post.note}</p>}
          </button>
          {post.moderationHidden && <p className="community-moderation">Bài viết này đang được quản trị viên ẩn.</p>}
          {!post.isPublished && !post.moderationHidden && <p className="community-moderation">Cây đã tắt chia sẻ. Bài viết chỉ hiển thị với bạn.</p>}
          <CommunityPhotos photos={post.photos} onOpen={() => setSelected({ id: post.id, tab: 'post' })} />
          <button type="button" className="community-plant-link" onClick={() => setSelected({ id: post.id, tab: post.includeHistory ? 'notes' : 'post' })}><Leaf size={17} aria-hidden="true" /><span>{post.plant.speciesName}{post.plant.archived ? ' · Đã lưu trữ' : ''}</span><ChevronRight size={17} aria-hidden="true" /></button>
          <div className="community-card-actions"><CommunityReactions post={post} {...controls} onChanged={() => {}} /><button type="button" className="community-comment-link" onClick={() => setSelected({ id: post.id, tab: 'post' })}><MessageCircle size={19} aria-hidden="true" />{post.commentCount} bình luận</button></div>
        </article>
      </li>)}</ul>}
      {feed.page?.nextCursor && <button type="button" className="button button-secondary load-more" disabled={feed.loadingMore} onClick={() => void feed.loadMore()}>{feed.loadingMore ? 'Đang tải…' : 'Xem thêm bài viết'}</button>}
    </>}
    {editor && <CommunityPostEditor key={editor.post?.id ?? 'new'} post={editor.post} {...controls} onDismiss={() => setEditor(null)} onSaved={saved} onOpenGarden={() => { setEditor(null); onNavigate('garden'); }} />}
  </section>;
}

function PostAuthor({ post, onEdit }: { post: CommunityPost; onEdit?: () => void }) {
  return <header className="community-card-author"><span className="community-avatar" aria-hidden="true"><Leaf size={21} /></span><div><strong>{post.isOwner ? 'Vườn của bạn' : post.author}</strong><p><time dateTime={post.happenedAt}>{communityDateTime.format(new Date(post.happenedAt))}</time></p></div>{onEdit && <button type="button" className="community-icon-button" aria-label={`Sửa bài ${post.title}`} onClick={onEdit}><Pencil size={18} aria-hidden="true" /></button>}</header>;
}

function CommunityPostDetail({ postId, initialTab, revision, csrfToken, onExpired, onEdit, onBack, onDeleted }: CommunityControls & {
  postId: string; initialTab: DetailTab; revision: number; onEdit: (post: CommunityPost) => void; onBack: () => void; onDeleted: () => void;
}) {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState(initialTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void request<CommunityPost>(`/community/posts/${postId}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setPost(result);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setPost(null);
      setError(displayError(failure, onExpired));
    });
    return () => controller.abort();
  }, [postId, version, revision, onExpired]);

  async function remove() {
    setDeleting(true);
    setError('');
    try {
      await request(`/community/posts/${postId}`, { method: 'DELETE', csrfToken });
      onDeleted();
    } catch (failure) {
      setError(displayError(failure, onExpired));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const activeTab = post?.includeHistory ? tab : 'post';
  return <div className="community-post-detail">
    <button type="button" className="text-button community-back" disabled={deleting} onClick={onBack}><ArrowLeft size={19} aria-hidden="true" /> Về Góc xanh</button>
    <ErrorNotice message={error} />
    {!post && (error ? <button type="button" className="button button-secondary" onClick={reload}>Thử lại</button> : <p className="muted" role="status">Đang mở bài viết…</p>)}
    {post && <>
      <article className="community-card community-detail-card">
        <PostAuthor post={post} onEdit={post.isOwner ? () => onEdit(post) : undefined} />
        <h1>{post.title}</h1>
        {post.note && <p className="community-caption">{post.note}</p>}
        {post.moderationHidden && <p className="community-moderation">Bài viết này đang được quản trị viên ẩn.</p>}
        {!post.isPublished && !post.moderationHidden && <p className="community-moderation">Cây đã tắt chia sẻ. Chỉ bạn xem được bài viết này. Bạn có thể đổi quyền chia sẻ trong hồ sơ cây.</p>}
        <CommunityPhotos photos={post.photos} />
        <div className="community-plant-summary"><Leaf size={21} aria-hidden="true" /><div><strong>{post.plant.speciesName}</strong><p>{post.plant.archived ? 'Cây đã lưu trữ' : 'Cây đang được theo dõi'}</p></div></div>
        <div className="community-card-actions"><CommunityReactions key={`${post.id}:${post.myReaction}:${Object.values(post.reactions).join('.')}`} post={post} csrfToken={csrfToken} onExpired={onExpired} onChanged={reload} /><span className="community-meta">{post.commentCount} bình luận</span></div>
        {post.isOwner && <div className="community-owner-actions"><button type="button" className="text-button" onClick={() => onEdit(post)}><Pencil size={16} aria-hidden="true" /> Sửa bài</button><button type="button" className="text-button community-delete-action" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" /> Xóa bài</button></div>}
      </article>
      {post.includeHistory && <div className="community-detail-tabs" aria-label="Nội dung cây">{(Object.keys(detailTabs) as DetailTab[]).map((key) => <button type="button" key={key} aria-pressed={activeTab === key} onClick={() => setTab(key)}>{detailTabs[key]}</button>)}</div>}
      {!post.includeHistory && <p className="community-history-privacy">{post.isOwner ? 'Nhật ký và lịch sử kiểm tra của cây đang được giữ riêng tư trong bài viết này.' : 'Chủ cây chia sẻ nội dung trong bài viết; nhật ký và lịch sử kiểm tra vẫn riêng tư.'}</p>}
      {activeTab === 'post' && <CommunityComments postId={postId} csrfToken={csrfToken} onExpired={onExpired} onChanged={reload} readOnly={!post.isPublished} />}
      {activeTab !== 'post' && <CommunityPlantHistory key={activeTab} postId={postId} kind={activeTab} onExpired={onExpired} />}
    </>}
    {confirmDelete && <Dialog title="Xóa bài viết?" busy={deleting} onDismiss={() => setConfirmDelete(false)}><p>Ảnh, cảm xúc và bình luận của bài viết cũng sẽ bị xóa.</p><div className="form-actions"><button type="button" className="button button-secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Giữ lại</button><button type="button" className="button button-primary" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Đang xóa…' : 'Xóa bài viết'}</button></div></Dialog>}
  </div>;
}
