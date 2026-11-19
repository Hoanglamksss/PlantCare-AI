import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Camera, ChevronRight, CircleCheck, ImagePlus, Leaf, ScanLine, Trash2, TriangleAlert } from 'lucide-react';
import { ApiError, cropLabels, displayError, isCropCode, request, type CropCode, type Page, type Plant, type Scan, type Session } from './api';
import { CameraCapture } from './CameraCapture';
import { acceptedPhotoTypes, readPhoto, usePhotoPreview, validatePhoto } from './photo';
import { Dialog, ErrorNotice } from './ui';
import './diagnosis.css';

const statusText = { queued: 'Đang chờ', processing: 'Đang phân tích', completed: 'Đã kiểm tra', failed: 'Xử lý gián đoạn' };
const pending = (status: Scan['status']) => status === 'queued' || status === 'processing';
const cropName = (code: string) => isCropCode(code) ? cropLabels[code] : code;
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

export function Diagnosis({ session, onExpired, initialPlantId, initialCrop = 'tomato' }: {
  session: Session; onExpired: () => void; initialPlantId?: string; initialCrop?: CropCode;
}) {
  const [file, setFile] = useState<File | null>(null);
  const preview = usePhotoPreview(file);
  const [species, setSpecies] = useState<CropCode>(initialCrop);
  const [plantId, setPlantId] = useState('');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantCursor, setPlantCursor] = useState<string | null>(null);
  const [plantsBusy, setPlantsBusy] = useState(!!initialPlantId);
  const [history, setHistory] = useState<Page<Scan>>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [action, setAction] = useState<'submit' | 'retry' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [pollError, setPollError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const requestKey = useRef('');
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const resultAnchor = useRef<HTMLElement>(null);


  useEffect(() => {
    const controller = new AbortController();
    void request<Page<Plant>>('/plants?limit=100', { signal: controller.signal }).then((page) => {
      setPlants((current) => [...current.filter(({ id }) => !page.items.some((plant) => plant.id === id)), ...page.items]);
      setPlantCursor(page.nextCursor);
    }).catch((failure) => { if (!controller.signal.aborted) setError(displayError(failure, onExpired)); });
    if (initialPlantId) {
      void request<Plant>(`/plants/${encodeURIComponent(initialPlantId)}`, { signal: controller.signal }).then((plant) => {
        if (!isCropCode(plant.speciesCode)) return;
        setSpecies(plant.speciesCode);
        setPlantId(plant.id);
        setPlants((current) => current.some(({ id }) => id === plant.id) ? current : [plant, ...current]);
      }).catch((failure) => { if (!controller.signal.aborted) setError(displayError(failure, onExpired)); })
        .finally(() => { if (!controller.signal.aborted) setPlantsBusy(false); });
    }
    void request<Page<Scan>>('/diagnoses', { signal: controller.signal }).then(setHistory).catch((failure) => {
      if (!controller.signal.aborted) setHistoryError(displayError(failure, onExpired));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialPlantId, onExpired]);

  const selectedId = selected?.id;
  const isPending = selected ? pending(selected.status) : false;
  useEffect(() => {
    if (selectedId && window.matchMedia('(max-width: 48rem)').matches) {
      resultAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !isPending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    async function poll() {
      if (document.hidden) { timer = setTimeout(() => void poll(), 5000); return; }
      try {
        const scan = await request<Scan>(`/diagnoses/${selectedId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPollError('');
        setSelected((current) => current?.id === scan.id ? scan : current);
        setHistory((current) => ({ ...current, items: current.items.map((item) => item.id === scan.id ? scan : item) }));
        if (!pending(scan.status)) return;
      } catch (failure) {
        if (controller.signal.aborted) return;
        setPollError(displayError(failure, onExpired));
        if (failure instanceof ApiError && [401, 404, 410].includes(failure.status)) {
          setSelected((current) => current?.id === selectedId ? null : current);
          setHistory((current) => ({ ...current, items: current.items.filter((scan) => scan.id !== selectedId) }));
          return;
        }
      }
      delay = Math.min(delay * 1.5, 10000);
      timer = setTimeout(() => void poll(), delay);
    }
    timer = setTimeout(() => void poll(), delay);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedId, isPending, onExpired]);

  function chooseFile(photo?: File) {
    if (!photo) return;
    requestKey.current = '';
    const issue = validatePhoto(photo);
    setFile(issue ? null : photo);
    setError(issue);
  }

  function openCamera() {
    if (typeof navigator.mediaDevices?.getUserMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches) setCameraOpen(true);
    else cameraInput.current?.click();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || action) return;
    setAction('submit');
    setError('');
    setPollError('');
    const body = new FormData();
    body.append('image', file);
    body.append('speciesCode', species);
    if (plantId) body.append('plantId', plantId);
    try {
      requestKey.current ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
      const created = await request<Pick<Scan, 'id' | 'status'>>('/diagnoses', {
        method: 'POST', body, csrfToken: session.csrfToken, idempotencyKey: requestKey.current,
      });
      const scan = await request<Scan>(`/diagnoses/${created.id}`);
      setSelected(scan);
      setHistory((current) => ({ ...current, items: [scan, ...current.items.filter(({ id }) => id !== scan.id)] }));
      setFile(null);
      requestKey.current = '';
    } catch (failure) { setError(displayError(failure, onExpired)); }
    finally { setAction(null); }
  }

  async function loadPlants() {
    if (!plantCursor || plantsBusy) return;
    setPlantsBusy(true);
    try {
      const page = await request<Page<Plant>>(`/plants?limit=100&cursor=${encodeURIComponent(plantCursor)}`);
      setPlants((current) => [...current, ...page.items.filter((plant) => !current.some(({ id }) => id === plant.id))]);
      setPlantCursor(page.nextCursor);
    } catch (failure) { setError(displayError(failure, onExpired)); }
    finally { setPlantsBusy(false); }
  }

  async function loadHistory(cursor?: string) {
    if (historyBusy) return;
    setHistoryBusy(true);
    setHistoryError('');
    try {
      const more = await request<Page<Scan>>(cursor ? `/diagnoses?cursor=${encodeURIComponent(cursor)}` : '/diagnoses');
      setHistory((current) => ({ ...more, items: cursor ? [...current.items, ...more.items] : more.items }));
    } catch (failure) { setHistoryError(displayError(failure, onExpired)); }
    finally { setHistoryBusy(false); }
  }

  async function openScan(scan: Scan) {
    setSelected(scan);
    setPollError('');
    try {
      const refreshed = await request<Scan>(`/diagnoses/${scan.id}`);
      setSelected((current) => current?.id === refreshed.id ? refreshed : current);
      setHistory((current) => ({ ...current, items: current.items.map((item) => item.id === refreshed.id ? refreshed : item) }));
    } catch (failure) { setPollError(displayError(failure, onExpired)); }
  }

  async function updateScan(operation: 'retry' | 'delete') {
    if (!selected || action) return;
    const id = selected.id;
    setAction(operation);
    setPollError('');
    try {
      const base = `/diagnoses/${id}`;
      if (operation === 'delete') {
        await request<void>(base, { method: 'DELETE', csrfToken: session.csrfToken });
        setSelected(null);
        setDeleting(false);
        setHistory((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
      } else {
        await request(`${base}/retry`, { method: 'POST', csrfToken: session.csrfToken });
        const scan = await request<Scan>(base);
        setSelected((current) => current?.id === scan.id ? scan : current);
        setHistory((current) => ({ ...current, items: current.items.map((item) => item.id === scan.id ? scan : item) }));
      }
    } catch (failure) {
      setPollError(displayError(failure, onExpired));
      if (operation === 'retry') {
        const currentScan = await request<Scan>(`/diagnoses/${id}`).catch(() => null);
        if (currentScan) setSelected((current) => current?.id === id ? currentScan : current);
      }
    } finally { setAction(null); }
  }

  return (
    <section className={`diagnosis-page${selected ? ' diagnosis-has-result' : ''}`} aria-labelledby="scan-title">
      {!selected ? <form className="scan-stage" onSubmit={submit}>
        <header className="scan-stage-heading">
          <a href="#garden" aria-label="Về cây của tôi"><ArrowLeft size={22} aria-hidden="true" /></a>
          <h1 id="scan-title">Chẩn đoán bằng ảnh</h1>
          <Leaf size={22} aria-hidden="true" />
        </header>
        <p className="scan-stage-intro">Hiểu chiếc lá, chăm đúng cách.</p>
        <div className={`scan-viewfinder${preview ? ' has-photo' : ''}`}>
          {preview ? <img src={preview} alt="Ảnh lá đã chọn" /> : <div className="scan-viewfinder-empty"><Leaf size={78} strokeWidth={1} aria-hidden="true" /><span>Đưa vùng lá cần kiểm tra vào khung</span></div>}
          <div className="scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
          {preview && <span className="scan-frame-caption">Ảnh đã sẵn sàng</span>}
        </div>
        <p className="scan-photo-tip">Chụp rõ mặt lá và vùng đổi màu.<br />Ưu tiên ánh sáng tự nhiên, tránh bóng tối.</p>
        <div className="scan-upload-controls">
            <input hidden type="file" ref={cameraInput} aria-label="Ảnh từ camera" accept={acceptedPhotoTypes} capture="environment" onChange={(event) => chooseFile(readPhoto(event.currentTarget))} />
            <input hidden type="file" ref={photoInput} aria-label="Ảnh trong thư viện" accept={acceptedPhotoTypes} onChange={(event) => chooseFile(readPhoto(event.currentTarget))} />
            <button className="scan-side-control" type="button" disabled={!!action} onClick={() => photoInput.current?.click()}><ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" /><span>Thư viện</span></button>
            <button className="scan-shutter" type="button" disabled={!!action} onClick={openCamera} aria-label={file ? 'Chụp lại ảnh' : 'Chụp ảnh'}><span><Camera size={27} strokeWidth={1.6} aria-hidden="true" /></span></button>
            <div className="scan-format"><Leaf size={23} strokeWidth={1.5} aria-hidden="true" /><span>Ảnh lá cây</span></div>
        </div>
        <div className="scan-upload-details form-stack">
          <div className="scan-fields">
            <label className="field">Loại cây<select value={species} disabled={!!action || plantsBusy} onChange={(event) => { setSpecies(event.target.value as CropCode); setPlantId(''); requestKey.current = ''; }}>
              {Object.entries(cropLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label className="field">Gắn hồ sơ cây<select value={plantId} disabled={!!action || plantsBusy} onChange={(event) => { setPlantId(event.target.value); requestKey.current = ''; }}>
              <option value="">Kiểm tra riêng</option>{plants.filter((plant) => plant.speciesCode === species).map((plant) => <option key={plant.id} value={plant.id}>{plant.nickname}</option>)}
            </select></label>
          </div>
          {plantCursor && <button type="button" className="button button-plain" disabled={plantsBusy} onClick={() => void loadPlants()}>Tải thêm hồ sơ cây</button>}
          <ErrorNotice message={error} />
          {file && <button className="button scan-submit" type="submit" disabled={!!action || loading || historyBusy || plantsBusy}><ScanLine size={19} aria-hidden="true" /> {action === 'submit' ? 'Đang gửi ảnh…' : 'Phân tích ảnh lá'}</button>}
          <small className="scan-file-limits">JPEG, PNG, WebP · tối đa 8 MiB</small>
        </div>
      </form> : <section className="scan-result" aria-labelledby="scan-title" ref={resultAnchor}>
          <header className="scan-result-heading">
            <button type="button" aria-label="Kiểm tra ảnh khác" disabled={!!action} onClick={() => { setSelected(null); setPollError(''); }}><ArrowLeft size={22} aria-hidden="true" /></button>
            <h1 id="scan-title">Kết quả kiểm tra</h1>
            <span aria-hidden="true" />
          </header>
          <ErrorNotice message={pollError} />
          <div className="scan-result-summary">
            <img className="scan-result-photo" src={`/api/v1/diagnoses/${encodeURIComponent(selected.id)}/photo`} alt="Ảnh lá của lần kiểm tra này" />
            <div>
              <span className="scan-crop-label">{cropName(selected.speciesCode)}</span>
              <h2>{selected.status === 'completed' ? selected.findings?.[0]?.label ?? (selected.outcome === 'healthy' ? 'Chưa thấy dấu hiệu rõ' : 'Cần ảnh rõ hơn') : statusText[selected.status]}</h2>
              <span className={`scan-result-badge ${selected.outcome === 'healthy' ? 'is-clear' : ''}`} role="status">{selected.status === 'completed' ? selected.outcome === 'healthy' ? 'Tiếp tục theo dõi' : 'Cần kiểm tra thêm' : statusText[selected.status]}</span>
            </div>
          </div>
            {isPending && <p className="scan-progress"><ScanLine size={20} aria-hidden="true" /> Ảnh đang được xử lý. Bạn có thể mở lại kết quả từ lịch sử.</p>}
            {selected.status === 'completed' && <>
              <p className="scan-result-description">{selected.recommendation || 'Đối chiếu dấu hiệu trên lá với các bước kiểm tra bên dưới.'}</p>
              <div className={`scan-result-callout ${selected.outcome === 'healthy' ? 'is-clear' : ''}`}>
                {selected.outcome === 'healthy' ? <CircleCheck size={21} aria-hidden="true" /> : <TriangleAlert size={21} aria-hidden="true" />}
                <div><strong>{selected.outcome === 'healthy' ? 'Theo dõi lá mới' : 'Lá có dấu hiệu cần quan sát'}</strong><p>Ảnh giúp sàng lọc màu sắc. Xác định bệnh cụ thể cần thêm dấu hiệu trên cây.</p></div>
              </div>
              {selected.findings?.map((finding) => <div key={finding.code} className="scan-finding"><strong>{finding.label}</strong><p>{finding.detail}</p></div>)}
              {!!selected.possibleCauses?.length && <section className="scan-advice"><h3>Nguyên nhân có thể</h3><ul>{selected.possibleCauses.map((cause) => <li key={cause.label}><strong>{cause.label}</strong><p>{cause.detail}</p></li>)}</ul></section>}
              {!!selected.careSteps?.length && <section className="scan-advice scan-care"><h3>Giúp cây hồi phục</h3><p className="scan-section-caption">Bắt đầu bằng các bước kiểm tra tại nhà</p><ol>{selected.careSteps.map((step) => <li key={step}>{step}</li>)}</ol></section>}
              <a className="scan-reference" href="https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-problems/managing-plant-diseases-in-the-home-garden" target="_blank" rel="noreferrer">Tham khảo chăm cây · UMN Extension <ChevronRight size={14} aria-hidden="true" /></a>
            </>}
            {selected.status === 'failed' && <p className="muted">Lần kiểm tra này chưa hoàn tất. {selected.retryable ? 'Bạn có thể thử lại với cùng ảnh.' : 'Hãy gửi một ảnh mới.'}</p>}
            <div className="scan-result-actions">
              <button className="button button-primary" type="button" disabled={!!action} onClick={() => { setSelected(null); setPollError(''); }}><Camera size={18} aria-hidden="true" /> Kiểm tra ảnh khác</button>
              <a className="button button-secondary" href={`#chat?crop=${encodeURIComponent(selected.speciesCode)}`}><Leaf size={18} aria-hidden="true" /> Hỏi thêm trợ lý</a>
            </div>
            <div className="scan-result-utilities">
              {selected.retryable && <button className="button button-secondary" disabled={!!action} onClick={() => void updateScan('retry')}>Thử lại</button>}
              <button className="button button-plain" disabled={!!action} onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden="true" /> Xóa ảnh</button>
            </div>
          <small className="scan-limit">Kết quả được lưu trong lịch sử. <a href={`/api/v1/diagnoses/${encodeURIComponent(selected.id)}/photo`} target="_blank" rel="noreferrer">Xem ảnh đã kiểm tra</a></small>
        </section>}
      <section className="scan-history" aria-labelledby="history-title">
        <div className="scan-history-heading"><h2 id="history-title">Lịch sử kiểm tra</h2><button className="text-button" disabled={historyBusy || loading || !!action} onClick={() => void loadHistory()}>Làm mới</button></div>
        <ErrorNotice message={historyError} />
        {loading ? <p role="status">Đang tải lịch sử…</p> : !history.items.length && !historyError ? <p className="muted">Bạn chưa kiểm tra ảnh nào.</p> : null}
        {history.items.map((scan) => <button className="scan-history-item" key={scan.id} disabled={!!action} onClick={() => void openScan(scan)}>
          <span><strong>{cropName(scan.speciesCode)}</strong><small>{dateFormat.format(new Date(scan.createdAt))}</small></span><span>{statusText[scan.status]}<ChevronRight size={17} aria-hidden="true" /></span>
        </button>)}
        {history.nextCursor && <button className="button button-secondary" disabled={historyBusy || !!action} onClick={() => void loadHistory(history.nextCursor!)}>Xem thêm</button>}
      </section>
      {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onPick={() => {
        setCameraOpen(false); photoInput.current?.click();
      }} onCapture={(photo) => { chooseFile(photo); setCameraOpen(false); }} />}
      {deleting && <Dialog title="Xóa lần kiểm tra?" busy={action === 'delete'} onDismiss={() => setDeleting(false)}>
        <p>Ảnh và kết quả sẽ bị xóa khỏi lịch sử của bạn.</p><ErrorNotice message={pollError} />
        <div className="form-actions"><button className="button button-secondary" disabled={!!action} onClick={() => setDeleting(false)}>Giữ lại</button><button className="button button-primary" disabled={!!action} onClick={() => void updateScan('delete')}>Xóa ảnh và kết quả</button></div>
      </Dialog>}
    </section>
  );
}
