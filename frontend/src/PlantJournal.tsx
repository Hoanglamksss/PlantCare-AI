import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { CalendarClock, Camera, ClipboardPenLine, Droplets, Eye, ImagePlus, Leaf, Plus, ScanLine, X } from 'lucide-react';
import { activities, displayError, request, type CareLog, type Scan } from './api';
import { usePage } from './collections';
import { CameraCapture } from './CameraCapture';
import { acceptedPhotoTypes, readPhoto, usePhotoPreview, validatePhoto } from './photo';
import { Dialog, ErrorNotice } from './ui';
import './journal.css';

type JournalForm = { kind: 'care' | 'note' } | { kind: 'date'; entry: CareLog };
type SessionControls = { csrfToken: string; onExpired: () => void };
type Photo = { src: string; alt: string };
const maxJournalPhotos = 4;
const maxJournalBytes = 8 * 1024 * 1024;
const photoKey = (photo: File) => `${photo.name}:${photo.size}:${photo.lastModified}`;

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const scanStatuses = {
  queued: 'Đang chờ',
  processing: 'Đang phân tích',
  completed: 'Đã kiểm tra',
  failed: 'Xử lý gián đoạn',
};
const activityIcons = { watering: Droplets, fertilizing: Leaf, observation: Eye };

export function PlantJournal({ plantId, archived, locked, csrfToken, onExpired, onScan }: SessionControls & {
  plantId: string;
  archived: boolean;
  locked: boolean;
  onScan: () => void;
}) {
  const plantPath = `/plants/${encodeURIComponent(plantId)}`;
  const logs = usePage<CareLog>(`${plantPath}/care-logs`, onExpired);
  const scans = usePage<Scan>(`/diagnoses?plantId=${encodeURIComponent(plantId)}`, onExpired);
  const [form, setForm] = useState<JournalForm | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <div className="plant-journal">
      <section className="log-section journal-section" aria-labelledby="logs-heading">
        <div className="section-heading journal-heading">
          <h2 id="logs-heading">Nhật ký chăm sóc</h2>
          <div className="journal-actions">
            {!archived && <button type="button" className="button button-secondary" disabled={locked} onClick={() => setForm({ kind: 'care' })}><Plus size={16} aria-hidden="true" /> Ghi hoạt động</button>}
            <button type="button" className="button button-primary" disabled={locked} onClick={() => setForm({ kind: 'note' })}>
              <ClipboardPenLine size={17} aria-hidden="true" /> Thêm ghi chú
            </button>
          </div>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
        <JournalCollection data={logs} name="nhật ký" emptyMessage="Cây này chưa có ghi chép chăm sóc.">
          {(entry) => {
            const photos = entry.photoUrls?.length ? entry.photoUrls : entry.photoUrl ? [entry.photoUrl] : [];
            const Icon = entry.isJournalNote ? ClipboardPenLine : activityIcons[entry.activity];
            return <li className="journal-entry" key={entry.id}>
              <div className="journal-entry-body">
                <div className="journal-entry-heading">
                  <span className="journal-activity-icon" data-activity={entry.activity}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
                  <div><strong>{entry.isJournalNote ? 'Ghi chú' : activities[entry.activity]}</strong><JournalTime value={entry.happenedAt} /></div>
                </div>
                {entry.note && <p>{entry.note}</p>}
                {!!photos.length && <div className="journal-gallery" data-count={photos.length}>
                  {photos.map((src, index) => <PhotoPreview key={src} photo={{ src, alt: `Ảnh nhật ký ${index + 1}` }} onOpen={setPhoto} />)}
                </div>}
                {entry.isJournalNote && <button type="button" className="text-button journal-edit-date" disabled={locked} onClick={() => setForm({ kind: 'date', entry })}>
                  <CalendarClock size={16} aria-hidden="true" /> Sửa ngày giờ
                </button>}
              </div>
            </li>;
          }}
        </JournalCollection>
      </section>
      <section className="log-section journal-section" aria-labelledby="plant-scans-heading">
        <div className="section-heading journal-heading">
          <h2 id="plant-scans-heading">Lịch sử kiểm tra ảnh</h2>
          <div className="journal-actions">
            {scans.page?.items.some(({ status }) => status === 'queued' || status === 'processing') && (
              <button type="button" className="button button-secondary" onClick={scans.reload}>Làm mới</button>
            )}
            <button type="button" className="button button-primary" disabled={locked} onClick={onScan}>
              <ScanLine size={17} aria-hidden="true" /> Kiểm tra ảnh cây này
            </button>
          </div>
        </div>
        <JournalCollection data={scans} name="lịch sử kiểm tra" emptyMessage="Các lần kiểm tra gắn với cây sẽ xuất hiện ở đây.">
          {(scan) => <AssessmentEntry key={scan.id} scan={scan} onOpen={setPhoto} />}
        </JournalCollection>
      </section>
      {form && <JournalEntryDialog form={form} plantPath={plantPath} csrfToken={csrfToken} onExpired={onExpired} onDismiss={() => setForm(null)} onSaved={(message) => {
        setNotice(message);
        setForm(null);
        logs.reload();
      }} />}
      {photo && <Dialog title="Ảnh đã lưu" busy={false} onDismiss={() => setPhoto(null)}>
        <SavedPhoto className="journal-full-photo" photo={photo} />
      </Dialog>}
    </div>
  );
}

function JournalCollection<T>({ data, name, emptyMessage, children }: {
  data: ReturnType<typeof usePage<T>>;
  name: string;
  emptyMessage: string;
  children: (item: T) => ReactNode;
}) {
  const { page, error, reload, loadMore, loadingMore } = data;
  return <>
    <ErrorNotice message={error} />
    {!page && (error
      ? <button type="button" className="button button-secondary" onClick={reload}>Thử lại</button>
      : <p className="muted" role="status">Đang tải {name}…</p>)}
    {page?.items.length === 0 && <p className="empty-log muted">{emptyMessage}</p>}
    {page && page.items.length > 0 && <ol className="log-list">{page.items.map(children)}</ol>}
    {page?.nextCursor && <button type="button" className="button button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>
      {loadingMore ? 'Đang tải…' : 'Xem thêm'}
    </button>}
  </>;
}

function AssessmentEntry({ scan, onOpen }: { scan: Scan; onOpen: (photo: Photo) => void }) {
  const finding = scan.findings?.[0];
  const careSteps = scan.careSteps ?? [];
  const possibleCauses = scan.possibleCauses ?? [];
  const showDetails = careSteps.length > 0 || possibleCauses.length > 0 || (scan.findings?.length ?? 0) > 1;

  return <li className="journal-entry journal-assessment">
    <PhotoPreview photo={{ src: `/api/v1/diagnoses/${encodeURIComponent(scan.id)}/photo`, alt: 'Ảnh của lần kiểm tra cây' }} onOpen={onOpen} />
    <div className="journal-entry-body">
      <div className="log-entry-heading">
        <strong className="journal-scan-status" data-status={scan.status}><ScanLine size={13} aria-hidden="true" /> {scanStatuses[scan.status]}</strong>
        <JournalTime value={scan.createdAt} />
      </div>
      {scan.status === 'completed' && <>
        {finding && <p><strong>{finding.label}</strong> · {finding.detail}</p>}
        {scan.recommendation && <p>{scan.recommendation}</p>}
        {showDetails && <details className="journal-scan-details">
          <summary>Chi tiết kiểm tra</summary>
          {scan.findings?.slice(1).map((item) => <p key={item.code}><strong>{item.label}</strong> · {item.detail}</p>)}
          {possibleCauses.length > 0 && <>
            <h3>Nguyên nhân có thể</h3>
            <ul>{possibleCauses.map((item) => <li key={item.label}><strong>{item.label}</strong> · {item.detail}</li>)}</ul>
          </>}
          {careSteps.length > 0 && <>
            <h3>Bước chăm sóc</h3>
            <ol>{careSteps.map((step) => <li key={step}>{step}</li>)}</ol>
          </>}
        </details>}
      </>}
      {scan.status === 'failed' && <p className="muted">Mở mục Chụp ảnh để thử lại hoặc gửi ảnh mới.</p>}
    </div>
  </li>;
}

function JournalEntryDialog({ form, plantPath, csrfToken, onExpired, onDismiss, onSaved }: SessionControls & {
  form: JournalForm;
  plantPath: string;
  onDismiss: () => void;
  onSaved: (message: string) => void;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const isNote = form.kind === 'note';
  const initialDate = form.kind === 'date' ? new Date(form.entry.happenedAt) : new Date();


  function attachPhotos(selected: File[]) {
    if (!selected.length) return;
    const issue = selected.map(validatePhoto).find(Boolean);
    if (issue) { setError(issue); return; }
    const combined = [...new Map([...photos, ...selected].map((photo) => [photoKey(photo), photo])).values()];
    if (combined.length > maxJournalPhotos) { setError(`Mỗi ghi chú đính kèm tối đa ${maxJournalPhotos} ảnh.`); return; }
    if (combined.reduce((sum, photo) => sum + photo.size, 0) > maxJournalBytes) { setError('Tổng dung lượng ảnh tối đa 8 MiB.'); return; }
    setPhotos(combined);
    setError('');
  }

  function openCamera() {
    if (typeof navigator.mediaDevices?.getUserMedia === 'function') setCameraOpen(true);
    else cameraInput.current?.click();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    const note = String(fields.get('note') ?? '').trim();
    const date = new Date(String(fields.get('happenedAt') ?? ''));
    if (Number.isNaN(date.getTime())) { setError('Hãy chọn ngày và giờ hợp lệ.'); return; }
    if (isNote && !note && !photos.length) { setError('Hãy nhập ghi chú hoặc chọn ảnh.'); return; }

    const happenedAt = date.toISOString();
    setError('');
    setSaving(true);
    try {
      if (form.kind === 'date') {
        await request<CareLog>(`${plantPath}/notes/${encodeURIComponent(form.entry.id)}`, { method: 'PATCH', csrfToken, body: { happenedAt } });
        onSaved('Đã cập nhật ngày giờ ghi chú.');
      } else if (form.kind === 'note') {
        const body = photos.length ? journalMultipart(note, happenedAt, photos) : { note, happenedAt };
        await request<CareLog>(`${plantPath}/notes`, { method: 'POST', csrfToken, body });
        onSaved('Đã lưu ghi chú.');
      } else {
        const body = { activity: String(fields.get('activity') ?? ''), happenedAt, note: note || null };
        await request<CareLog>(`${plantPath}/care-logs`, { method: 'POST', csrfToken, body });
        onSaved('Đã lưu hoạt động.');
      }
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setSaving(false);
    }
  }

  const title = { care: 'Ghi hoạt động chăm sóc', note: 'Thêm ghi chú', date: 'Sửa ngày giờ ghi chú' }[form.kind];
  return <>
    <Dialog title={title} busy={saving} onDismiss={onDismiss}>
      <ErrorNotice message={error} />
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={saving} className="form-stack">
          {form.kind === 'care' && <label className="field">
            Hoạt động
            <select name="activity" required>
              {Object.entries(activities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
          <label className="field">Ngày và giờ<input type="datetime-local" name="happenedAt" defaultValue={localDateTime(initialDate)} required /></label>
          {form.kind !== 'date' && <label className="field">Ghi chú<textarea name="note" maxLength={1000} rows={3} /></label>}
          {isNote && <div className="journal-photo-picker">
            <p className="journal-photo-label">Ảnh <span className="field-hint">· {photos.length}/{maxJournalPhotos}</span></p>
            {!!photos.length && <ul className="journal-attachments">{photos.map((photo, index) => <li key={photoKey(photo)}>
              <AttachmentPreview photo={photo} index={index} onRemove={() => {
                setPhotos((current) => current.filter((file) => file !== photo));
                setError('');
              }} />
            </li>)}</ul>}
            <input hidden type="file" ref={cameraInput} accept={acceptedPhotoTypes} capture="environment" onChange={(event) => {
              const photo = readPhoto(event.currentTarget);
              if (photo) attachPhotos([photo]);
            }} />
            <input hidden multiple type="file" ref={libraryInput} accept={acceptedPhotoTypes} onChange={(event) => {
              const photos = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              attachPhotos(photos);
            }} />
            <div className="journal-actions">
              <button type="button" className="button button-secondary" disabled={photos.length >= maxJournalPhotos} onClick={openCamera}><Camera size={16} aria-hidden="true" /> Chụp ảnh</button>
              <button type="button" className="button button-secondary" disabled={photos.length >= maxJournalPhotos} onClick={() => libraryInput.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Chọn ảnh</button>
            </div>
            <p className="field-hint">JPEG, PNG hoặc WebP, tổng tối đa 8 MiB. Ảnh hiện với thành viên cộng đồng khi bạn bật chia sẻ nhật ký của cây.</p>
          </div>}
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={onDismiss}>Hủy</button>
            <button type="submit" className="button button-primary">{saving ? 'Đang lưu…' : 'Lưu'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
    {cameraOpen && <CameraCapture title="Chụp ảnh ghi chú" onClose={() => setCameraOpen(false)} onPick={() => {
      flushSync(() => setCameraOpen(false));
      libraryInput.current?.click();
    }} onCapture={(photo) => {
      attachPhotos([photo]);
      setCameraOpen(false);
    }} />}
  </>;
}

function journalMultipart(note: string, happenedAt: string, photos: File[]) {
  const body = new FormData();
  body.set('note', note);
  body.set('happenedAt', happenedAt);
  for (const photo of photos) body.append('images', photo);
  return body;
}

function AttachmentPreview({ photo, index, onRemove }: { photo: File; index: number; onRemove: () => void }) {
  const url = usePhotoPreview(photo);
  return <>
    {url && <img src={url} alt={`Ảnh đính kèm ${index + 1}`} />}
    <button className="journal-remove-photo" type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={onRemove}><X size={15} aria-hidden="true" /></button>
  </>;
}

function PhotoPreview({ photo, onOpen }: { photo: Photo; onOpen: (photo: Photo) => void }) {
  return <button type="button" className="journal-photo-button" aria-label={`Mở ${photo.alt.toLocaleLowerCase('vi-VN')}`} onClick={() => onOpen(photo)}>
    <SavedPhoto photo={photo} />
  </button>;
}

function SavedPhoto({ photo, className }: { photo: Photo; className?: string }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <span className="journal-photo-unavailable">Chưa tải được ảnh</span>;
  return <img className={className} src={photo.src} alt={photo.alt} loading="lazy" onError={() => setUnavailable(true)} />;
}

function JournalTime({ value }: { value: string }) {
  return <time dateTime={value}>{dateTimeFormat.format(new Date(value))}</time>;
}

function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
