import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, BookOpen, ChevronRight, ImagePlus, Leaf, MessageCircle, Plus, Sprout, X } from 'lucide-react';
import { ApiError, cropLabels, displayError, isCropCode, request, type CropCode, type Plant, type Session } from './api';
import { usePage } from './collections';
import { ChatScreening } from './ChatScreening';
import { acceptedPhotoTypes, fitUploadPhotos, readPhoto, usePhotoPreview, validatePhoto } from './photo';
import { ErrorNotice } from './ui';
import './chat.css';

type Reply = { text: string; source: { title: string; url: string } | null; photoSuggested: boolean; speciesCode: CropCode | null; interpretation?: string; origin?: 'model' | 'guide' | 'journal' };
type Turn = { requestId: string; question: string; reply: Reply | null; diagnosisId: string | null; plantId: string | null };
type Submission = { id: string; question: string; file: File | null; crop: CropCode | ''; focus: string | null; plantId: string | null; diagnosisId?: string };
const suggestions = ['Lá cà chua vàng, đất vẫn ướt', 'Dưa leo có hoa mà chưa đậu quả', 'Tạo lịch tưới ở đâu?'];
const plantQuestion = 'Xem hồ sơ cây này và gợi ý mình nên theo dõi điều gì tiếp theo.';

export function Chat({ session, onExpired, initialCrop }: { session: Session; onExpired: () => void; initialCrop?: CropCode }) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [crop, setCrop] = useState<CropCode | ''>(initialCrop ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [plantPending, setPlantPending] = useState(false);
  const garden = usePage<Plant>('/plants?archived=false', onExpired);
  const [focus, setFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [modelEnabled, setModelEnabled] = useState(false);
  const [screeningEnabled, setScreeningEnabled] = useState(true);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [imageRequestId, setImageRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendFailed, setSendFailed] = useState(false);
  const preview = usePhotoPreview(file);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Submission | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const attachmentsId = useId();
  const selectedCrop = plant && isCropCode(plant.speciesCode) ? plant.speciesCode : crop;
  const availablePlants = garden.page?.items.filter(item => isCropCode(item.speciesCode)) ?? [];

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (history.current && messages.length) history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    request<{ items: Turn[]; modelEnabled: boolean; screeningEnabled?: boolean }>('/chat', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setMessages(data.items);
        setModelEnabled(data.modelEnabled);
        setScreeningEnabled(data.screeningEnabled !== false);
        setReady(true);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(displayError(failure, onExpired));
      });
    return () => controller.abort();
  }, [loadVersion, onExpired]);

  async function ask(raw: string) {
    const query = raw.trim() || (file ? 'Kiểm tra ảnh lá này giúp mình.' : plantPending ? plantQuestion : '');
    if (!ready || !query || active.current) return;
    const plantId = plant?.id ?? null;
    if (file && !screeningEnabled) { setError('Sàng lọc ảnh đang chưa khả dụng. Bạn có thể bỏ ảnh và mô tả dấu hiệu bằng chữ.'); return; }
    if (file && !selectedCrop) { setError('Chọn loại cây hoặc đính kèm cây để gửi ảnh.'); setAttachmentsOpen(true); return; }

    const last = pending.current;
    const submission: Submission = last && last.file === file && last.crop === selectedCrop && last.plantId === plantId && last.focus === focus && last.question === query
      ? last : { question: query, file, crop: selectedCrop, focus, plantId, id: crypto.randomUUID() };
    pending.current = submission;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setSendFailed(false);
    setError('');
    setImageRequestId('');
    setAttachmentsOpen(false);
    setMessages((current) => [...current, { requestId: submission.id, question: query, reply: null, diagnosisId: null, plantId }]);
    try {
      if (file && !submission.diagnosisId) {
        const body = new FormData();
        body.set('speciesCode', selectedCrop);
        if (plantId) body.set('plantId', plantId);
        try {
          const [upload] = await fitUploadPhotos([file]);
          if (controller.signal.aborted) return;
          if (!upload) throw new Error('Không xử lý được ảnh.');
          body.set('image', upload);
        } catch (failure) {
          if (!controller.signal.aborted) {
            setMessages((current) => current.filter((entry) => entry.requestId !== submission.id));
            setError(failure instanceof Error ? failure.message : 'Không xử lý được ảnh.');
          }
          return;
        }
        const receipt = await request<{ id: string }>('/diagnoses', {
          method: 'POST', csrfToken: session.csrfToken, body, idempotencyKey: submission.id, signal: controller.signal,
        });
        submission.diagnosisId = receipt.id;
      }
      const reply = await request<Reply & { diagnosisId: string | null; plantId: string | null }>('/chat', {
        method: 'POST',
        body: { question: query, requestId: submission.id, ...(selectedCrop && { speciesCode: selectedCrop }), ...(plantId && { plantId }), ...(submission.diagnosisId ? { diagnosisId: submission.diagnosisId } : focus ? { contextDiagnosisId: focus } : {}) },
        csrfToken: session.csrfToken, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setMessages((current) => current.map((entry) => entry.requestId === submission.id
        ? { ...entry, reply, diagnosisId: reply.diagnosisId, plantId: reply.plantId } : entry).slice(-30));
      if (file) setFocus(null);
      setQuestion('');
      setFile(null);
      setPlantPending(false);
      pending.current = null;
    } catch (failure) {
      if (!controller.signal.aborted) {
        setMessages((current) => current.filter((entry) => entry.requestId !== submission.id));
        setQuestion(raw);
        setSendFailed(true);
        if (file && failure instanceof ApiError && failure.code === 'SCREENING_UNAVAILABLE') {
          setError('Sàng lọc ảnh đang chưa khả dụng. Ảnh vẫn ở ô soạn để thử lại, hoặc bạn có thể bỏ ảnh và mô tả dấu hiệu.');
          setImageRequestId(failure.requestId ?? '');
        } else {
          setError(displayError(failure, onExpired));
        }
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  function selectPlant(next: Plant | null) {
    setPlant(next);
    setPlantPending(Boolean(next));
    setFocus(null);
    setAttachmentsOpen(false);
    setError('');
    setSendFailed(false);
    setImageRequestId('');
    composer.current?.focus();
  }

  function selectCrop(value: CropCode | '') {
    setCrop(value);
    setFocus(null);
    setError('');
    setSendFailed(false);
    setAttachmentsOpen(false);
    composer.current?.focus();
  }

  return <section className="pc-chat" aria-labelledby="chat-title">
    <header className="pc-chat-header">
      <span className="pc-chat-avatar" aria-hidden="true"><Leaf size={26} /></span>
      <div><h1 id="chat-title">Trợ lý PlantCare</h1><p>Hỏi về chăm cây hoặc gửi ảnh lá</p></div>
    </header>
    <section className="pc-chat-conversation" aria-label="Trò chuyện" data-empty={!messages.length}>
      <div className="pc-chat-history" role="log" aria-label="Tin nhắn" aria-live="polite" ref={history}>
        {!messages.length && <div className="pc-chat-welcome">
          <span className="pc-chat-welcome-icon"><MessageCircle size={24} aria-hidden="true" /></span>
          <h2>Cây của bạn đang có dấu hiệu gì?</h2>
          <p>Kể ngắn điều bạn thấy hoặc gửi ảnh lá. Bạn có thể bổ sung chi tiết ở tin nhắn sau.</p>
        </div>}
        {messages.map(({ question: prompt, reply, requestId, diagnosisId, plantId: attachedPlantId }) => (
          <div className="pc-chat-exchange" key={requestId}>
            <div className="pc-chat-question">
              {attachedPlantId && <small className="pc-chat-attached-label">{garden.page?.items.find(item => item.id === attachedPlantId)?.nickname ?? 'Cây đã đính kèm'}</small>}
              {prompt}
            </div>
            <div className={`pc-chat-answer${reply ? '' : ' pc-chat-answer-pending'}`}>
              {reply?.interpretation && <p className="pc-chat-interpretation">Ý bạn là “{reply.interpretation.replace(/[?？]+$/, '')}”?</p>}
              {reply?.origin === 'guide' && modelEnabled && <span className="pc-chat-answer-origin">Hướng dẫn có sẵn</span>}
              <p>{reply?.text ?? 'Đang xử lý…'}</p>
              {reply?.source && <a href={reply.source.url} target="_blank" rel="noreferrer"><BookOpen size={14} aria-hidden="true" />{reply.source.title}<ChevronRight size={15} aria-hidden="true" /></a>}
              {reply?.photoSuggested && !diagnosisId && screeningEnabled && <button type="button" className="text-button" disabled={busy} onClick={() => {
                if (reply.speciesCode) setCrop(reply.speciesCode);
                picker.current?.click();
              }}>Đính kèm ảnh lá</button>}
            </div>
            {diagnosisId && <ChatScreening id={diagnosisId} session={session} onExpired={onExpired} onFocus={() => {
              if (busy) return;
              if (plant?.id !== attachedPlantId) setPlant(garden.page?.items.find(item => item.id === attachedPlantId) ?? null);
              setPlantPending(false);
              setFocus(diagnosisId);
              setFile(null);
              composer.current?.focus();
            }} />}
          </div>
        ))}
      </div>
      {!messages.length && <aside className="pc-chat-suggestions" aria-label="Câu hỏi gợi ý">
        <div>{suggestions.map((prompt) => <button type="button" key={prompt} disabled={!ready || busy || !!file} onClick={() => void ask(prompt)}>{prompt}<ChevronRight size={16} aria-hidden="true" /></button>)}</div>
      </aside>}
      <form className="pc-chat-form" onSubmit={submit}>
        <ErrorNotice message={error} />
        {imageRequestId && <p className="pc-chat-request-id">Mã yêu cầu <code>{imageRequestId}</code></p>}
        {sendFailed && error && <button type="button" className="text-button" disabled={busy} onClick={() => void ask(question)}>Thử gửi lại</button>}
        {!ready && error && <button type="button" className="text-button" onClick={() => { setError(''); setLoadVersion((value) => value + 1); }}>Tải lại hội thoại</button>}
        {(plant || crop) && <div className="pc-chat-context-chip">
          <Sprout size={17} aria-hidden="true" />
          <span role="status">{plant ? `Đã đính kèm ${plant.nickname} · ${plant.speciesName}` : `Loại cây · ${crop && cropLabels[crop]}`}</span>
          <button type="button" className="text-button" disabled={busy} aria-label={plant ? 'Bỏ cây đính kèm' : 'Bỏ loại cây'}
            onClick={() => plant ? selectPlant(null) : selectCrop('')}><X size={16} aria-hidden="true" /></button>
        </div>}
        {focus && !file && <p className="pc-chat-image-context">Đang hỏi về ảnh đã chọn. <button type="button" className="text-button" disabled={busy} onClick={() => setFocus(null)}>Bỏ chọn ảnh</button></p>}
        {file && <div className="pc-chat-attachment">
          {preview && <img src={preview} alt="Xem trước ảnh lá" />}
          <span>{file.name}</span>
          <button type="button" className="text-button" disabled={busy} onClick={() => {
            setFile(null); setError(''); setImageRequestId(''); setSendFailed(false); composer.current?.focus();
          }}>Bỏ ảnh</button>
        </div>}
        <input type="file" hidden ref={picker} accept={acceptedPhotoTypes} disabled={!ready || busy} onChange={(event) => {
          const chosen = readPhoto(event.currentTarget);
          if (!chosen) return;
          const problem = validatePhoto(chosen);
          setError(problem);
          if (!problem) {
            setFile(chosen);
            setImageRequestId('');
            setSendFailed(false);
          }
        }} />
        <div className="pc-chat-compose">
          <div className="pc-chat-tools" onKeyDown={(event) => {
            if (event.key === 'Escape' && attachmentsOpen) {
              setAttachmentsOpen(false);
              addButton.current?.focus();
            }
          }}>
            <button ref={addButton} type="button" className="pc-chat-add" disabled={!ready || busy} aria-label="Tùy chọn đính kèm"
              aria-expanded={attachmentsOpen} aria-controls={attachmentsId} onClick={() => setAttachmentsOpen(value => !value)}>
              <Plus size={21} aria-hidden="true" />
            </button>
            {attachmentsOpen && <div className="pc-chat-tools-panel" id={attachmentsId} aria-label="Đính kèm vào chat">
              <button type="button" className="button button-secondary pc-chat-photo-picker" disabled={!screeningEnabled}
                onClick={() => { setAttachmentsOpen(false); picker.current?.click(); }}><ImagePlus size={17} aria-hidden="true" /> Đính kèm ảnh lá</button>
              {!screeningEnabled && <p className="muted">Sàng lọc ảnh đang chưa khả dụng. Bạn vẫn có thể hỏi bằng chữ.</p>}
              <label>Loại cây
                <select value={selectedCrop} disabled={Boolean(plant)} onChange={(event) => {
                  const value = event.target.value;
                  selectCrop(isCropCode(value) ? value : '');
                }}>
                  <option value="">Chọn loại cây</option>
                  {Object.entries(cropLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </label>
              <label>Đính kèm cây từ Vườn cây
                <select value={plant?.id ?? ''} disabled={!availablePlants.length}
                  onChange={(event) => selectPlant(availablePlants.find(item => item.id === event.target.value) ?? null)}>
                  <option value="">Chọn cây đã lưu</option>
                  {availablePlants.map(item => <option key={item.id} value={item.id}>{item.nickname} · {item.speciesName}</option>)}
                </select>
              </label>
              {!garden.page && !garden.error && <p role="status">Đang tải cây…</p>}
              {garden.page && !availablePlants.length && <p className="muted">Chưa có cây được hỗ trợ. <a href="#garden">Mở Vườn cây</a></p>}
              {garden.error && <button type="button" className="text-button" onClick={garden.reload}>Tải lại cây</button>}
              {garden.page?.nextCursor && <button type="button" className="text-button" disabled={garden.loadingMore}
                onClick={() => void garden.loadMore()}>Xem thêm cây</button>}
            </div>}
          </div>
          <label><span className="pc-chat-sr">Câu hỏi chăm sóc cây</span>
            <textarea ref={composer} rows={2} maxLength={600} value={question} disabled={!ready || busy} onChange={(event) => { setQuestion(event.target.value); setSendFailed(false); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  void ask(question);
                }
              }} placeholder={plantPending ? 'Nhập câu hỏi hoặc bấm Gửi để xem hồ sơ cây…' : 'Hỏi về cây của bạn…'} />
          </label>
          <button type="submit" disabled={!ready || busy || (!question.trim() && !file && !plantPending)} aria-label="Gửi"><ArrowUp size={23} aria-hidden="true" /></button>
        </div>
        {ready && !modelEnabled && <p className="pc-chat-footnote">Trợ lý đang dùng hướng dẫn có sẵn.</p>}
      </form>
    </section>
  </section>;
}
