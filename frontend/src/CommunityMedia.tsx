import { useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { acceptedPhotoTypes, usePhotoPreview, validatePhoto } from './photo';
import { Dialog } from './ui';
import type { CommunityPhoto } from './communityTypes';

const maxPhotos = 4;
const maxBytes = 8 * 1024 * 1024;
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

export function CommunityPhotos({ photos, onOpen, compact = false }: {
  photos: CommunityPhoto[];
  onOpen?: () => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<CommunityPhoto | null>(null);
  if (!photos.length) return null;
  return <>
    <div className={`community-photo-grid${compact ? ' community-photo-grid--compact' : ''}`} data-count={photos.length}>
      {photos.map((photo, index) => <button type="button" key={photo.id} onClick={onOpen ?? (() => setSelected(photo))} aria-label={`Mở ảnh ${index + 1}`}>
        <CommunityImage url={photo.url} alt={`Ảnh được chia sẻ ${index + 1}`} />
      </button>)}
    </div>
    {selected && <Dialog title="Ảnh được chia sẻ" busy={false} onDismiss={() => setSelected(null)}>
      <CommunityImage key={selected.id} url={selected.url} alt="Ảnh được chia sẻ đang mở" full />
      {photos.length > 1 && <div className="community-photo-switch" aria-label="Chọn ảnh">
        {photos.map((photo, index) => <button type="button" key={photo.id} aria-pressed={photo.id === selected.id} onClick={() => setSelected(photo)}>{index + 1}</button>)}
      </div>}
    </Dialog>}
  </>;
}

export function CommunityImage({ url, alt, full = false }: { url: string; alt: string; full?: boolean }) {
  const [failedUrl, setFailedUrl] = useState('');
  if (failedUrl === url) return <span className="community-photo-unavailable">Ảnh hiện không khả dụng</span>;
  return <img className={full ? 'community-photo-full' : undefined} src={url} alt={alt} loading="lazy" onError={() => setFailedUrl(url)} />;
}

export function CommunityMediaPicker({ photos, onPhotos, existing = [], onExisting, disabled, onError }: {
  photos: File[];
  onPhotos: (photos: File[]) => void;
  existing?: CommunityPhoto[];
  onExisting?: (photos: CommunityPhoto[]) => void;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const count = existing.length + photos.length;

  function attach(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const issue = files.map(validatePhoto).find(Boolean);
    if (issue) { onError(issue); return; }
    const combined = [...new Map([...photos, ...files].map((file) => [fileKey(file), file])).values()];
    if (existing.length + combined.length > maxPhotos) { onError(`Mỗi lần đính kèm tối đa ${maxPhotos} ảnh.`); return; }
    if (combined.reduce((sum, file) => sum + file.size, 0) > maxBytes) { onError('Tổng dung lượng ảnh mới tối đa 8 MiB.'); return; }
    onPhotos(combined);
    onError('');
  }

  return <div className="community-media-picker">
    {!!count && <ul className="community-attachments">
      {existing.map((photo, index) => <li key={photo.id}>
        <CommunityImage url={photo.url} alt={`Ảnh đã lưu ${index + 1}`} />
        <button type="button" disabled={disabled} aria-label={`Bỏ ảnh đã lưu ${index + 1}`} onClick={() => onExisting?.(existing.filter((item) => item.id !== photo.id))}><X size={15} aria-hidden="true" /></button>
      </li>)}
      {photos.map((photo, index) => <li key={fileKey(photo)}>
        <FilePreview file={photo} index={index} />
        <button type="button" disabled={disabled} aria-label={`Bỏ ảnh mới ${index + 1}`} onClick={() => onPhotos(photos.filter((item) => item !== photo))}><X size={15} aria-hidden="true" /></button>
      </li>)}
    </ul>}
    <input type="file" hidden ref={library} multiple accept={acceptedPhotoTypes} onChange={(event) => attach(event.currentTarget)} />
    <input type="file" hidden ref={camera} capture="environment" accept={acceptedPhotoTypes} onChange={(event) => attach(event.currentTarget)} />
    <div className="community-media-actions">
      <button type="button" className="button button-secondary" disabled={disabled || count >= maxPhotos} onClick={() => library.current?.click()}><ImagePlus size={17} aria-hidden="true" /> Thêm ảnh</button>
      <button type="button" className="button button-plain" disabled={disabled || count >= maxPhotos} onClick={() => camera.current?.click()}><Camera size={18} aria-hidden="true" /> Chụp ảnh</button>
      <span>{count}/{maxPhotos}</span>
    </div>
  </div>;
}

function FilePreview({ file, index }: { file: File; index: number }) {
  const preview = usePhotoPreview(file);
  return preview ? <img src={preview} alt={`Ảnh mới ${index + 1}`} /> : null;
}
