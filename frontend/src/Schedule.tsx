import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Clock3, Droplets, Leaf, Pause, Pencil, Plus, Repeat2, Scissors, Sprout, SunMedium, Trash2 } from 'lucide-react';
import { ApiError, displayError, request, type Page, type Plant, type Session } from './api';
import { Dialog, ErrorNotice } from './ui';
import './schedule.css';

type Activity = 'watering' | 'fertilizing' | 'observation' | 'pruning' | 'repotting' | 'custom';
type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly';

type ScheduleItem = {
  id: string;
  plantId: string;
  activity: Activity;
  title: string;
  startDate: string;
  time: string;
  recurrence: Recurrence;
  interval: number;
  active: boolean;
};

const activityLabels: Record<Activity, string> = {
  watering: 'Tưới nước',
  fertilizing: 'Bón phân',
  observation: 'Quan sát',
  pruning: 'Cắt tỉa',
  repotting: 'Thay chậu',
  custom: 'Công việc tùy chỉnh',
};

const recurrenceLabels: Record<Recurrence, string> = {
  once: 'Một lần',
  daily: 'Hằng ngày',
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
};

function storageKey(accountId: string) {
  return `plantcare-care-schedules:${accountId}`;
}

async function allPages<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<T> = await request(`${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export function Schedule({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsError, setPlantsError] = useState('');
  const [plantsLoading, setPlantsLoading] = useState(true);
  const [plantsVersion, setPlantsVersion] = useState(0);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string>();
  const [deleting, setDeleting] = useState<ScheduleItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const mutating = useRef(false);
  const actions = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    actions.current = controller;
    return () => { controller.abort(); };
  }, [session.user.id, session.csrfToken]);

  useEffect(() => {
    const controller = new AbortController();
    setPlantsLoading(true);
    setPlantsError('');
    Promise.all([allPages<Plant>('/plants', controller.signal), allPages<Plant>('/plants?archived=true', controller.signal)])
      .then(([active, archived]) => {
        if (!controller.signal.aborted) setPlants([...active, ...archived]);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPlantsError(displayError(error, onExpired));
      }).finally(() => {
        if (!controller.signal.aborted) setPlantsLoading(false);
      });
    return () => controller.abort();
  }, [onExpired, plantsVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      const key = storageKey(session.user.id);
      try {
        const old = localStorage.getItem(key);
        if (old) {
          const entries: unknown = JSON.parse(old);
          if (!Array.isArray(entries)) throw new Error('invalid_schedule_backup');
          const remaining: unknown[] = [...entries];
          let index = 0;
          let lastIssue = '';
          while (index < remaining.length) {
            const item = remaining[index];
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              lastIssue = 'Một lịch cũ có dữ liệu không hợp lệ.';
              index += 1;
              continue;
            }
            const { id: clientId, ...fields } = item as Record<string, unknown>;
            try {
              await request('/schedules', { method: 'POST', csrfToken: session.csrfToken,
                body: { ...fields, clientId }, signal: controller.signal });
            } catch (failure) {
              if (failure instanceof ApiError && [400, 404, 409].includes(failure.status)) {
                lastIssue = failure.message;
                index += 1;
                continue;
              }
              if (!(failure instanceof ApiError && failure.status === 410)) throw failure;
            }
            if (controller.signal.aborted) return;
            remaining.splice(index, 1);
            // Checkpoint each accepted clientId so a rate-limited retry can advance.
            if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
            else localStorage.removeItem(key);
          }
          if (!remaining.length) localStorage.removeItem(key);
          else setError(`Còn ${remaining.length} lịch cũ chưa chuyển được; bản lưu vẫn được giữ trên trình duyệt. ${lastIssue}`);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(`Chưa chuyển hết lịch cũ lên tài khoản. Bản lưu trên trình duyệt vẫn được giữ. ${displayError(failure, onExpired)}`);
      }
      const items = await allPages<ScheduleItem>('/schedules', controller.signal);
      if (!controller.signal.aborted) setSchedules(items);
    }
    void load().catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(displayError(failure, onExpired));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session.user.id, session.csrfToken, onExpired, version]);

  async function save(next: ScheduleItem) {
    const signal = actions.current?.signal;
    if (!signal || signal.aborted) return;
    const { id, ...fields } = next;
    const original = editing;
    const body = original
      ? Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original[key as keyof ScheduleItem]))
      : { ...fields, clientId: id };
    if (original && !Object.keys(body).length) { setEditing(null); setFormOpen(false); return; }
    const saved = await request<ScheduleItem>(original ? `/schedules/${id}` : '/schedules', {
      method: original ? 'PATCH' : 'POST', body, csrfToken: session.csrfToken, signal,
    });
    if (signal.aborted) return;
    setSchedules((current) => original ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    setEditing(null);
    setFormOpen(false);
  }

  async function mutate(item: ScheduleItem, remove = false) {
    const signal = actions.current?.signal;
    if (!signal || signal.aborted || mutating.current || loading) return;
    mutating.current = true;
    setBusyId(item.id);
    setError('');
    try {
      if (remove) {
        await request(`/schedules/${item.id}`, { method: 'DELETE', csrfToken: session.csrfToken, signal });
        if (signal.aborted) return;
        setSchedules((current) => current.filter((entry) => entry.id !== item.id));
        setDeleting(null);
      } else {
        const saved = await request<ScheduleItem>(`/schedules/${item.id}`, {
          method: 'PATCH', body: { active: !item.active }, csrfToken: session.csrfToken, signal,
        });
        if (signal.aborted) return;
        setSchedules((current) => current.map((entry) => entry.id === item.id ? saved : entry));
      }
    } catch (failure) {
      if (!signal.aborted) setError(displayError(failure, onExpired));
    } finally {
      mutating.current = false;
      if (!signal.aborted) setBusyId(undefined);
    }
  }

  const visible = schedules.filter((item) => filter === 'all' || (filter === 'active' ? item.active : !item.active));
  const activeCount = schedules.filter((item) => item.active).length;
  const activePlants = plants.filter((plant) => !plant.archivedAt);
  const canCreate = !loading && !plantsLoading && !plantsError && activePlants.length > 0 && !busyId;

  return (
    <section className="schedule-page" aria-labelledby="schedule-title">
      <div className="schedule-hero">
        <div className="schedule-hero-copy">
          <span className="schedule-eyebrow"><SunMedium size={15} aria-hidden="true" /> Lịch chăm sóc</span>
          <h1 id="schedule-title">Những việc nhỏ,<br /><em>cây lớn khỏe.</em></h1>
          <p>Đặt giờ tưới, quan sát và chăm sóc để mỗi khu vườn đều có lịch riêng.</p>
        </div>
        <button className="schedule-hero-add" type="button" disabled={!canCreate} onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={21} aria-hidden="true" />
          <span>Thêm lịch chăm sóc</span>
        </button>
        <div className="schedule-deco schedule-deco-one" />
        <div className="schedule-deco schedule-deco-two" />
      </div>

      <ErrorNotice message={plantsError} />
      {plantsError && <button type="button" className="text-button" disabled={plantsLoading} onClick={() => setPlantsVersion((value) => value + 1)}>Tải lại danh sách cây</button>}
      <ErrorNotice message={error} />
      {error && <button type="button" className="text-button" onClick={() => setVersion((value) => value + 1)}>Tải lại lịch</button>}
      <p className="muted">Lịch lưu trong tài khoản · Giờ Việt Nam (UTC+7). Nhắc việc xuất hiện trong chuông thông báo.</p>
      <div className="schedule-toolbar">
        <div className="filters schedule-filters" aria-label="Lọc lịch chăm sóc">
          <button className="filter" type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả <span>{schedules.length}</span></button>
          <button className="filter" type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Đang bật <span>{activeCount}</span></button>
          <button className="filter" type="button" aria-pressed={filter === 'paused'} onClick={() => setFilter('paused')}>Tạm dừng <span>{schedules.length - activeCount}</span></button>
        </div>
        <button className="button button-primary schedule-add-button" type="button" onClick={() => { setEditing(null); setFormOpen(true); }} disabled={!canCreate}>
          <Plus size={17} aria-hidden="true" /> Tạo lịch
        </button>
      </div>

      {loading ? <p role="status">Đang đồng bộ lịch chăm sóc…</p> : visible.length === 0 ? (
        <div className="schedule-empty">
          <span className="schedule-empty-icon"><CalendarClock size={28} aria-hidden="true" /></span>
          <h2>{schedules.length ? 'Không có lịch ở mục này' : 'Chưa có lịch chăm sóc'}</h2>
          <p>{activePlants.length ? 'Tạo lịch đầu tiên để nhận nhắc đúng giờ.' : 'Thêm hoặc khôi phục cây trong Vườn cây trước khi đặt lịch.'}</p>
          {activePlants.length > 0 ? <button className="button button-primary" type="button" disabled={!canCreate} onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={17} aria-hidden="true" /> Đặt lịch ngay</button> : <a className="button button-secondary" href="#garden">Mở Vườn cây</a>}
        </div>
      ) : (
        <div className="schedule-grid">
          {visible.map((item) => {
            const plant = plants.find((entry) => entry.id === item.plantId);
            return (
              <article className={`schedule-card ${item.active ? '' : 'is-paused'}`} key={item.id}>
                <div className={`schedule-card-accent activity-${item.activity}`}>
                  <ActivityIcon activity={item.activity} />
                </div>
                <div className="schedule-card-content">
                  <div className="schedule-card-heading">
                    <div>
                      <span className="schedule-activity">{activityLabels[item.activity]}</span>
                      <h2>{item.title}</h2>
                    </div>
                    <span className={`schedule-status ${item.active ? 'is-active' : ''}`}>{item.active ? 'Đang bật' : 'Đã tắt'}</span>
                  </div>
                  <p className="schedule-plant"><Leaf size={14} aria-hidden="true" /> {plant?.nickname ?? 'Cây của tôi'}{plant?.archivedAt ? ' · Đã lưu trữ, tạm ngừng nhắc' : ''}</p>
                  <div className="schedule-meta">
                    <span><Clock3 size={15} aria-hidden="true" /> {item.time}</span>
                    <span><Repeat2 size={15} aria-hidden="true" /> {item.recurrence === 'once'
                      ? recurrenceLabels.once
                      : `Mỗi ${item.interval} ${item.recurrence === 'daily' ? 'ngày' : item.recurrence === 'weekly' ? 'tuần' : 'tháng'}`}</span>
                  </div>
                  <div className="schedule-card-actions">
                    <button type="button" disabled={!!busyId || loading || (!item.active && !!plant?.archivedAt)} className="schedule-action" onClick={() => void mutate(item)}>
                      {item.active ? <Pause size={16} aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />}
                      {item.active ? 'Tạm dừng' : 'Tiếp tục'}
                    </button>
                    <button type="button" disabled={!!busyId || loading || plantsLoading || !!plantsError} className="schedule-action" onClick={() => { setEditing(item); setFormOpen(true); }}><Pencil size={16} aria-hidden="true" /> Sửa</button>
                    <button type="button" disabled={!!busyId || loading} className="schedule-action schedule-action-delete" aria-label={`Xóa ${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <ScheduleForm
          plants={plants.filter((plant) => !plant.archivedAt || plant.id === editing?.plantId)}
          item={editing}
          onDismiss={() => { setFormOpen(false); setEditing(null); }}
          onSave={save}
          onExpired={onExpired}
        />
      )}
      {deleting && <Dialog title="Xóa lịch chăm sóc?" busy={!!busyId} onDismiss={() => setDeleting(null)}>
        <p>Lịch “{deleting.title}” sẽ dừng gửi nhắc việc.</p>
        <ErrorNotice message={error} />
        <div className="form-actions"><button type="button" className="button button-secondary" disabled={!!busyId} onClick={() => setDeleting(null)}>Giữ lại</button>
          <button type="button" className="button button-primary" disabled={!!busyId} onClick={() => void mutate(deleting, true)}>Xóa lịch</button></div>
      </Dialog>}
    </section>
  );
}

function ActivityIcon({ activity }: { activity: Activity }) {
  if (activity === 'watering') return <Droplets size={23} aria-hidden="true" />;
  if (activity === 'pruning') return <Scissors size={23} aria-hidden="true" />;
  if (activity === 'observation') return <SunMedium size={23} aria-hidden="true" />;
  if (activity === 'repotting') return <Sprout size={23} aria-hidden="true" />;
  return <Leaf size={23} aria-hidden="true" />;
}

function ScheduleForm({ plants, item, onDismiss, onSave, onExpired }: {
  plants: Plant[];
  item: ScheduleItem | null;
  onDismiss: () => void;
  onSave: (item: ScheduleItem) => Promise<void>;
  onExpired: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientId] = useState(() => crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const plantId = String(fields.get('plantId') ?? '');
    const title = String(fields.get('title') ?? '').trim();
    const startDate = String(fields.get('startDate') ?? '');
    const time = String(fields.get('time') ?? '');
    if (!plantId || !title || !startDate || !time) {
      setError('Hãy nhập đầy đủ cây, tiêu đề, ngày và giờ.');
      return;
    }
    setBusy(true);
    setError('');
    try { await onSave({
      id: item?.id ?? clientId,
      plantId,
      title,
      activity: String(fields.get('activity')) as Activity,
      startDate,
      time,
      recurrence: String(fields.get('recurrence')) as Recurrence,
      interval: Number(fields.get('interval') ?? 1),
      active: item?.active ?? true,
    }); } catch (failure) { setError(displayError(failure, onExpired)); }
    finally { setBusy(false); }
  }

  return (
    <Dialog title={item ? 'Chỉnh sửa lịch chăm sóc' : 'Tạo lịch chăm sóc'} busy={busy} onDismiss={onDismiss}>
      <ErrorNotice message={error} />
      {item && plants.find((plant) => plant.id === item.plantId)?.archivedAt && <p className="muted">Cây cũ đã lưu trữ. {item.active ? 'Chọn cây đang theo dõi hoặc tạm dừng lịch trước khi sửa.' : 'Khôi phục cây trước khi bật lại lịch; bạn vẫn sửa được lịch đang tạm dừng.'}</p>}
      <form onSubmit={submit}>
        <fieldset className="form-stack" disabled={busy}>
          <label className="field">Cây
            <select name="plantId" defaultValue={item?.plantId ?? plants[0]?.id ?? ''} required>
              {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.nickname} · {plant.speciesName}</option>)}
            </select>
          </label>
          <label className="field">Tên công việc
            <input name="title" defaultValue={item?.title ?? ''} maxLength={80} placeholder="Ví dụ: Tưới Cà chua buổi sáng" required />
          </label>
          <label className="field">Loại chăm sóc
            <select name="activity" defaultValue={item?.activity ?? 'watering'}>
              {(Object.keys(activityLabels) as Activity[]).map((activity) => <option key={activity} value={activity}>{activityLabels[activity]}</option>)}
            </select>
          </label>
          <div className="schedule-form-row">
            <label className="field">Ngày bắt đầu
              <input name="startDate" type="date" defaultValue={item?.startDate ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())} required />
            </label>
            <label className="field">Giờ
              <input name="time" type="time" defaultValue={item?.time ?? '07:00'} required />
            </label>
          </div>
          <div className="schedule-form-row">
            <label className="field">Chu kỳ
              <select name="recurrence" defaultValue={item?.recurrence ?? 'daily'}>
                {(Object.keys(recurrenceLabels) as Recurrence[]).map((recurrence) => <option key={recurrence} value={recurrence}>{recurrenceLabels[recurrence]}</option>)}
              </select>
            </label>
            <label className="field">Khoảng cách
              <input name="interval" type="number" min={1} max={365} defaultValue={item?.interval ?? 1} required />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={onDismiss}>Hủy</button>
            <button className="button button-primary" type="submit">{item ? 'Lưu thay đổi' : 'Tạo lịch'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
