import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Leaf, Pencil, Plus, RotateCcw, Share2 } from 'lucide-react';
import { displayError, request } from './api';
import type { Plant, Species } from './api';
import { usePage } from './collections';
import { PlantJournal } from './PlantJournal';
import { Dialog, ErrorNotice } from './ui';
import { PlantShareDialog } from './PlantShareDialog';
import { PlantPhoto } from './PlantPhoto';
import './garden.css';

type SessionControls = { csrfToken: string; onExpired: () => void };
type ScanAction = { onScanPlant: (plant: Pick<Plant, 'id' | 'speciesCode'>) => void };

export function Garden({ csrfToken, onExpired, onScanPlant, initialPlantId, initialAdding = false, onBackToList }: SessionControls & ScanAction & {
  initialPlantId?: string;
  initialAdding?: boolean;
  onBackToList?: () => void;
}) {
  const [archived, setArchived] = useState(false);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [formOpen, setFormOpen] = useState(initialAdding);
  const [openingPlant, setOpeningPlant] = useState(!!initialPlantId);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    if (!initialPlantId) return;
    const controller = new AbortController();
    setOpeningPlant(true);
    setOpenError('');
    void request<Plant>(`/plants/${encodeURIComponent(initialPlantId)}`, { signal: controller.signal }).then((selected) => {
      if (!controller.signal.aborted) {
        setPlant(selected);
        setArchived(selected.archivedAt !== null);
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setOpenError(displayError(failure, onExpired));
    }).finally(() => {
      if (!controller.signal.aborted) setOpeningPlant(false);
    });
    return () => controller.abort();
  }, [initialPlantId, onExpired]);

  if (openingPlant) return <p className="muted" role="status">Đang mở hồ sơ cây…</p>;

  if (plant) {
    return (
      <PlantDetail
        key={plant.id}
        plant={plant}
        csrfToken={csrfToken}
        onExpired={onExpired}
        onBack={() => {
          setPlant(null);
          onBackToList?.();
        }}
        onChanged={setPlant}
        onScanPlant={onScanPlant}
      />
    );
  }

  return (
    <section className="garden-page" aria-labelledby="garden-title">
      <div className="page-heading garden-heading">
        <div>
          <h1 id="garden-title">Cây của tôi</h1>
          <p className="muted">Một góc vườn, những lần chăm sóc.</p>
        </div>
        <button className="button button-primary" onClick={() => setFormOpen(true)}>
          <Plus size={18} aria-hidden="true" /> Thêm cây
        </button>
      </div>
      <div className="filters garden-filters" aria-label="Lọc theo trạng thái">
        <button className="filter" aria-pressed={!archived} onClick={() => setArchived(false)}><Leaf size={15} aria-hidden="true" /> Đang theo dõi</button>
        <button className="filter" aria-pressed={archived} onClick={() => setArchived(true)}><Archive size={15} aria-hidden="true" /> Đã lưu trữ</button>
      </div>
      <ErrorNotice message={openError} />
      <PlantList key={String(archived)} archived={archived} onSelect={setPlant} onExpired={onExpired} />
      {formOpen && (
        <PlantForm
          csrfToken={csrfToken}
          onExpired={onExpired}
          onDismiss={() => setFormOpen(false)}
          onSaved={(newPlant) => {
            setFormOpen(false);
            setArchived(false);
            setPlant(newPlant);
          }}
        />
      )}
    </section>
  );
}

function PlantList({ archived, onSelect, onExpired }: {
  archived: boolean;
  onSelect: (plant: Plant) => void;
  onExpired: () => void;
}) {
  const { page, error, loadingMore, loadMore, reload } = usePage<Plant>(`/plants?archived=${archived}`, onExpired);

  return (
    <section className="garden-list" aria-label={archived ? 'Cây đã lưu trữ' : 'Cây đang theo dõi'}>
      <ErrorNotice message={error} />
      {!page && (error
        ? <button className="button button-secondary" onClick={reload}>Thử lại</button>
        : <p className="muted" role="status">Đang tải cây…</p>)}
      {page?.items.length === 0 && (
        <div className="empty-state garden-empty">
          <span className="garden-empty-icon"><Leaf size={28} aria-hidden="true" /></span>
          <h2>{archived ? 'Chưa có cây đã lưu trữ' : 'Chưa có cây đang theo dõi'}</h2>
          <p className="muted">{archived ? 'Cây bạn lưu trữ sẽ xuất hiện ở đây.' : 'Chọn Thêm cây để tạo hồ sơ và bắt đầu ghi nhật ký.'}</p>
        </div>
      )}
      {page && page.items.length > 0 && (
        <div className="garden-card-grid">
          {page.items.map((plant) => (
            <button key={plant.id} className="garden-plant-card" onClick={() => onSelect(plant)}>
              <PlantPhoto speciesCode={plant.speciesCode} className="garden-species-photo" />
              <span className="garden-card-copy">
                <span className="garden-species">{plant.speciesName}</span>
                <strong>{plant.nickname}</strong>
                {plant.plantedOn && <span className="garden-card-date"><CalendarDays size={13} aria-hidden="true" />{formatDate(plant.plantedOn)}</span>}
                <span className="garden-card-link">Xem cây <ArrowRight size={14} aria-hidden="true" /></span>
              </span>
              <ChevronRight className="garden-card-chevron" size={19} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {page?.nextCursor && <LoadMore loading={loadingMore} onClick={() => void loadMore()} />}
    </section>
  );
}

function PlantDetail({ plant, csrfToken, onExpired, onBack, onChanged, onScanPlant }: SessionControls & ScanAction & {
  plant: Plant;
  onBack: () => void;
  onChanged: (plant: Plant) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isArchived = plant.archivedAt !== null;

  async function toggleArchive() {
    setError('');
    setArchiving(true);
    try {
      onChanged(await request<Plant>(`/plants/${plant.id}`, {
        method: 'PATCH',
        csrfToken,
        body: { archived: !isArchived },
      }));
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setArchiving(false);
    }
  }

  return (
    <section className="garden-detail" aria-labelledby="garden-plant-title">
      <div className="garden-detail-intro">
        <figure className="garden-detail-photo">
          <PlantPhoto speciesCode={plant.speciesCode} className="garden-species-photo" />
          <button className="garden-photo-back" aria-label="Về Cây của tôi" disabled={archiving} onClick={onBack}><ArrowLeft size={21} aria-hidden="true" /></button>
          <figcaption>Ảnh minh họa loài {plant.speciesName.toLocaleLowerCase('vi-VN')}</figcaption>
        </figure>
        <div className="garden-detail-copy">
          <div className="garden-detail-pills">
            <span className="garden-species"><Leaf size={14} aria-hidden="true" /> {plant.speciesName}</span>
            {isArchived && <span className="garden-archived"><Archive size={13} aria-hidden="true" />Đã lưu trữ</span>}
          </div>
          <h1 id="garden-plant-title">{plant.nickname}</h1>
          {plant.plantedOn && <p className="garden-planted-date"><CalendarDays size={17} aria-hidden="true" /> Trồng ngày {formatDate(plant.plantedOn)}</p>}
          {plant.note && <p className="garden-plant-note">{plant.note}</p>}
          <div className="garden-detail-actions">
            <button className="button button-primary" disabled={archiving} onClick={() => setEditing(true)}><Pencil size={16} aria-hidden="true" /> Chỉnh sửa</button>
            <button className="button button-secondary" disabled={archiving} onClick={() => setSharing(true)}><Share2 size={17} aria-hidden="true" /> Chia sẻ</button>
            <button className="button button-secondary garden-archive-button" disabled={archiving} onClick={() => void toggleArchive()}>
              {isArchived ? <RotateCcw size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
              {archiving ? 'Đang lưu…' : isArchived ? 'Theo dõi lại' : 'Lưu trữ'}
            </button>
          </div>
        </div>
      </div>
      <div className="garden-detail-feedback">
        <ErrorNotice message={error} />
        {notice && <p className="notice" role="status">{notice}</p>}
      </div>
      <PlantJournal plantId={plant.id} archived={isArchived} locked={archiving} csrfToken={csrfToken} onExpired={onExpired} onScan={() => onScanPlant(plant)} />
      {editing && (
        <PlantForm
          plant={plant}
          csrfToken={csrfToken}
          onExpired={onExpired}
          onDismiss={() => setEditing(false)}
          onSaved={(updated) => {
            onChanged(updated);
            setEditing(false);
          }}
        />
      )}
      {sharing && <PlantShareDialog plantId={plant.id} suggestedTitle={plant.nickname} csrfToken={csrfToken} onExpired={onExpired} onDismiss={() => setSharing(false)} onSaved={(shared) => {
        setSharing(false);
        setNotice(shared ? 'Cây đã xuất hiện trong vườn cộng đồng.' : 'Đã ngừng chia sẻ cây này.');
      }} />}
    </section>
  );
}

function PlantForm({ plant, csrfToken, onExpired, onDismiss, onSaved }: SessionControls & {
  plant?: Plant;
  onDismiss: () => void;
  onSaved: (plant: Plant) => void;
}) {
  const [species, setSpecies] = useState<Species[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (plant) return;
    const controller = new AbortController();
    setCatalogError('');
    void request<{ items: Species[] }>('/catalog/species', { signal: controller.signal })
      .then(({ items }) => {
        if (!controller.signal.aborted) setSpecies(items);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setCatalogError(displayError(failure, onExpired));
      });
    return () => controller.abort();
  }, [plant, onExpired, catalogRevision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nickname = fieldText(data, 'nickname');
    if (!nickname) {
      setError('Hãy nhập tên cho cây.');
      return;
    }
    const values = { nickname, plantedOn: fieldText(data, 'plantedOn') || null, note: fieldText(data, 'note') || null };

    setError('');
    setBusy(true);
    try {
      const updated = await request<Plant>(plant ? `/plants/${plant.id}` : '/plants', {
        method: plant ? 'PATCH' : 'POST',
        body: plant ? values : { ...values, speciesCode: fieldText(data, 'speciesCode') },
        csrfToken,
      });
      onSaved(updated);
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={plant ? 'Chỉnh sửa cây' : 'Thêm cây'} busy={busy} onDismiss={onDismiss}>
      <ErrorNotice message={error || catalogError} />
      {!plant && !species && (catalogError
        ? <button className="button button-secondary" onClick={() => setCatalogRevision((value) => value + 1)}>Tải lại danh mục</button>
        : <p className="muted" role="status">Đang tải danh mục cây…</p>)}
      {!plant && species?.length === 0 && <p className="notice">Danh mục hiện chưa có loài cây để chọn.</p>}
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy} className="form-stack">
          <label className="field">
            Tên cây
            <input name="nickname" defaultValue={plant?.nickname} placeholder="Ví dụ: Cà chua ban công" required maxLength={80} />
          </label>
          {plant ? <p className="field-hint">Loài cây · {plant.speciesName}</p> : (
            <label className="field">
              Loài cây
              <select name="speciesCode" defaultValue="" required disabled={!species?.length}>
                <option value="" disabled>Chọn loài cây</option>
                {species?.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            Ngày trồng
            <input name="plantedOn" type="date" defaultValue={plant?.plantedOn ?? ''} />
          </label>
          <label className="field">
            Ghi chú
            <textarea name="note" defaultValue={plant?.note ?? ''} rows={3} maxLength={1000} />
          </label>
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={onDismiss}>Hủy</button>
            <button type="submit" className="button button-primary" disabled={!plant && !species?.length}>
              {busy ? 'Đang lưu…' : 'Lưu cây'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function LoadMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <button className="button button-secondary load-more" disabled={loading} onClick={onClick}>{loading ? 'Đang tải…' : 'Xem thêm'}</button>;
}

function fieldText(data: FormData, field: string) {
  return String(data.get(field) ?? '').trim();
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });
function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00`));
}
