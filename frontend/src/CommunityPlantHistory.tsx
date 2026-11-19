import type { ReactNode } from 'react';
import { activities } from './api';
import { usePage } from './collections';
import { ErrorNotice } from './ui';
import { CommunityPhotos } from './CommunityMedia';
import { communityDateTime } from './communityTypes';

type SharedNote = { id: string; activity: keyof typeof activities; note: string | null; happenedAt: string; isJournalNote: boolean; photoUrls: string[] };
type SharedCheck = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; outcome: 'healthy' | 'uncertain' | 'disease' | null; createdAt: string; findings: { code: string; label: string; detail: string }[]; photoUrl: string | null };
const checkLabels = { queued: 'Đang chờ', processing: 'Đang phân tích', completed: 'Đã kiểm tra', failed: 'Xử lý gián đoạn' };
const outcomeLabels = { healthy: 'Chưa thấy dấu hiệu rõ', uncertain: 'Cần kiểm tra thêm', disease: 'Có dấu hiệu bệnh' };

export function CommunityPlantHistory({ postId, kind, onExpired }: { postId: string; kind: 'notes' | 'diagnoses'; onExpired: () => void }) {
  const path = `/community/posts/${postId}/${kind}`;
  if (kind === 'notes') return <SharedCollection<SharedNote> path={path} onExpired={onExpired} empty="Cây này chưa có nhật ký được chia sẻ.">
    {(entry) => <>
      <div className="community-history-heading"><strong>{entry.isJournalNote ? 'Ghi chú' : activities[entry.activity]}</strong><time dateTime={entry.happenedAt}>{communityDateTime.format(new Date(entry.happenedAt))}</time></div>
      {entry.note && <p className="community-caption">{entry.note}</p>}
      <CommunityPhotos photos={entry.photoUrls.map((url) => ({ id: url, url }))} />
    </>}
  </SharedCollection>;
  return <SharedCollection<SharedCheck> path={path} onExpired={onExpired} empty="Cây này chưa có kết quả kiểm tra được chia sẻ.">
    {(entry) => <>
      <div className="community-history-heading"><strong>{entry.outcome ? outcomeLabels[entry.outcome] : checkLabels[entry.status]}</strong><time dateTime={entry.createdAt}>{communityDateTime.format(new Date(entry.createdAt))}</time></div>
      {entry.findings.map((finding) => <p className="community-caption" key={finding.code}><strong>{finding.label}</strong> · {finding.detail}</p>)}
      <CommunityPhotos photos={entry.photoUrl ? [{ id: entry.id, url: entry.photoUrl }] : []} />
    </>}
  </SharedCollection>;
}

function SharedCollection<Entry extends { id: string }>({ path, onExpired, empty, children }: {
  path: string; onExpired: () => void; empty: string; children: (entry: Entry) => ReactNode;
}) {
  const { page, error, reload, loadingMore, loadMore } = usePage<Entry>(path, onExpired);
  return <section className="community-history">
    <ErrorNotice message={error} />
    {!page && (error ? <button type="button" className="button button-secondary" onClick={reload}>Thử lại</button> : <p className="muted" role="status">Đang tải lịch sử cây…</p>)}
    {page?.items.length === 0 && <p className="community-empty-history">{empty}</p>}
    {page && <ul className="community-history-list">{page.items.map((entry) => <li key={entry.id}>{children(entry)}</li>)}</ul>}
    {page?.nextCursor && <button type="button" className="button button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Đang tải…' : 'Xem thêm lịch sử'}</button>}
  </section>;
}
