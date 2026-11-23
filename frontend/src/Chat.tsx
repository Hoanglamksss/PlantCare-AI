import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, BookOpen, ChevronDown, ChevronRight, ImagePlus, Leaf, MessageCircle, Sprout } from 'lucide-react';
import { cropLabels, displayError, isCropCode, request, type CropCode, type Plant, type Session } from './api';
import { usePage } from './collections';
import { ChatScreening } from './ChatScreening';
import { acceptedPhotoTypes, fitUploadPhotos, readPhoto, usePhotoPreview, validatePhoto } from './photo';
import { ErrorNotice } from './ui';
import './chat.css';

type Reply = { text: string; source: { title: string; url: string } | null; photoSuggested: boolean; speciesCode: CropCode | null; interpretation?: string; origin?: 'model' | 'guide' | 'journal' };
type Turn = { requestId: string; question: string; reply: Reply | null; diagnosisId: string | null; plantId: string | null };
type Submission = { id: string; question: string; file: File | null; crop: CropCode | ''; focus: string | null; plantId: string | null; diagnosisId?: string };
const suggestions = ['Lá cà chua bị đốm nâu thì kiểm tra gì?', 'Làm sao nhận biết rệp?', 'Tạo lịch tưới ở đâu?'];

export function Chat({ session, onExpired, initialCrop }: { session: Session; onExpired: () => void; initialCrop?: CropCode }) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [crop, setCrop] = useState<CropCode | ''>(initialCrop ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const garden = usePage<Plant>('/plants?archived=false', onExpired);
  const [focus, setFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [modelEnabled, setModelEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendFailed, setSendFailed] = useState(false);
  const preview = usePhotoPreview(file);
  const active = useRef<AbortController | null>(null);
  const pending = useRef<Submission | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const cropPicker = useRef<HTMLSelectElement>(null);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (history.current && messages.length) history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    request<{ items: Turn[]; modelEnabled: boolean }>('/chat', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setMessages(data.items);
        setModelEnabled(data.modelEnabled);
        setReady(true);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(displayError(failure, onExpired));
      });
    return () => controller.abort();
  }, [loadVersion, onExpired]);

  async function ask(raw: string) {
    const query = raw.trim() || (file ? 'Kiểm tra ảnh lá này giúp mình.' : '');
    if (!ready || !query || active.current) return;
    const selectedCrop = plant && isCropCode(plant.speciesCode) ? plant.speciesCode : crop;
    const plantId = plant?.id ?? null;
    if (file && !selectedCrop) { setError('Hãy chọn loại cây trước khi gửi ảnh.'); cropPicker.current?.focus(); return; }

    const last = pending.current;
    const submission: Submission = last && last.file === file && last.crop === selectedCrop && last.plantId === plantId && last.focus === focus && last.question === query
      ? last : { question: query, file, crop: selectedCrop, focus, plantId, id: crypto.randomUUID() };
    pending.current = submission;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setSendFailed(false);
    setError('');
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
      pending.current = null;
    } catch (failure) {
      if (!controller.signal.aborted) {
        setMessages((current) => current.filter((entry) => entry.requestId !== submission.id));
        setQuestion(raw);
        setSendFailed(true);
        setError(displayError(failure, onExpired));
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

  return <section className="pc-chat" aria-labelledby="chat-title">
    <header className="pc-chat-header">
      <span className="pc-chat-avatar" aria-hidden="true"><Leaf size={26} /></span>
      <div><h1 id="chat-title">Trợ lý PlantCare</h1><p>Hỏi về chăm cây hoặc gửi ảnh lá</p></div>
    </header>
    <div className="pc-chat-context">
      <span className="pc-chat-context-icon" aria-hidden="true"><Sprout size={23} /></span>
      <label>
        <span>Loại cây</span>
        <span className="pc-chat-select-wrap"><select ref={cropPicker} value={plant?.speciesCode ?? crop} onChange={(event) => setCrop(event.target.value as CropCode | '')} disabled={busy || !!plant}>
          <option value="">Chọn loại cây</option>
          {Object.entries(cropLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select><ChevronDown size={15} aria-hidden="true" /></span>
      </label>
    </div>
    <div className="pc-chat-context pc-chat-plant">
      <label>
        <span>Đính kèm cây từ Vườn cây</span>
        <span className="pc-chat-select-wrap"><select value={plant?.id ?? ''} disabled={busy || !garden.page}
          onChange={(event) => {
            setPlant(garden.page?.items.find(item => item.id === event.target.value) ?? null);
            setFocus(null);
          }}>
          <option value="">Không đính kèm cây</option>
          {garden.page?.items.filter(item => isCropCode(item.speciesCode)).map(item =>
            <option key={item.id} value={item.id}>{item.nickname} · {item.speciesName}</option>)}
        </select><ChevronDown size={15} aria-hidden="true" /></span>
      </label>
      {garden.error && <button type="button" className="text-button" onClick={garden.reload} disabled={busy}>Tải lại cây</button>}
      {garden.page?.nextCursor && <button type="button" className="text-button" disabled={busy || garden.loadingMore} onClick={() => void garden.loadMore()}>Xem thêm cây</button>}
    </div>
    <section className="pc-chat-conversation" aria-label="Trò chuyện" data-empty={!messages.length}>
      <div className="pc-chat-history" role="log" aria-label="Tin nhắn" aria-live="polite" ref={history}>
        {!messages.length && <div className="pc-chat-welcome">
          <span className="pc-chat-welcome-icon"><MessageCircle size={24} aria-hidden="true" /></span>
          <h2>Cây của bạn đang có dấu hiệu gì?</h2>
          <p>Mô tả điều bạn thấy hoặc gửi ảnh lá để cùng kiểm tra.</p>
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
              {reply?.photoSuggested && !diagnosisId && <button type="button" className="text-button" disabled={busy} onClick={() => {
                if (reply.speciesCode) setCrop(reply.speciesCode);
                picker.current?.click();
              }}>Đính kèm ảnh lá</button>}
            </div>
            {diagnosisId && <ChatScreening id={diagnosisId} session={session} onExpired={onExpired} onFocus={() => { if (busy) return; if (plant?.id !== attachedPlantId) setPlant(garden.page?.items.find(item => item.id === attachedPlantId) ?? null); setFocus(diagnosisId); setFile(null); composer.current?.focus(); }} />}
          </div>
        ))}
      </div>
      {!messages.length && <aside className="pc-chat-suggestions" aria-label="Câu hỏi gợi ý">
        <div>{suggestions.map((prompt) => <button type="button" key={prompt} disabled={!ready || busy || !!file} onClick={() => void ask(prompt)}>{prompt}<ChevronRight size={16} aria-hidden="true" /></button>)}</div>
      </aside>}
      <form className="pc-chat-form" onSubmit={submit}>
        <ErrorNotice message={error} />
        {sendFailed && error && <button type="button" className="text-button" disabled={busy} onClick={() => void ask(question)}>Thử gửi lại</button>}
        {!ready && error && <button type="button" className="text-button" onClick={() => { setError(''); setLoadVersion((value) => value + 1); }}>Tải lại hội thoại</button>}
        {focus && !file && <p className="pc-chat-image-context">Đang hỏi về ảnh đã chọn. <button type="button" className="text-button" disabled={busy} onClick={() => setFocus(null)}>Bỏ chọn ảnh</button></p>}
        {file && <div className="pc-chat-attachment">
          {preview && <img src={preview} alt="Xem trước ảnh lá" />}
          <span>{file.name}</span>
          <button type="button" className="text-button" disabled={busy} onClick={() => setFile(null)}>Bỏ ảnh</button>
        </div>}
        <input type="file" hidden ref={picker} accept={acceptedPhotoTypes} disabled={!ready || busy} onChange={(event) => {
          const chosen = readPhoto(event.currentTarget);
          if (!chosen) return;
          const problem = validatePhoto(chosen);
          setError(problem);
          if (!problem) setFile(chosen);
        }} />
        <div className="pc-chat-compose">
          <button type="button" className="pc-chat-add" disabled={!ready || busy} aria-label="Đính kèm ảnh lá" onClick={() => picker.current?.click()}><ImagePlus size={20} aria-hidden="true" /></button>
          <label><span className="pc-chat-sr">Câu hỏi chăm sóc cây</span>
            <textarea ref={composer} rows={2} maxLength={600} value={question} disabled={!ready || busy} onChange={(event) => { setQuestion(event.target.value); setSendFailed(false); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  void ask(question);
                }
              }} placeholder="Hỏi về cây của bạn…" />
          </label>
          <button type="submit" disabled={!ready || busy || (!question.trim() && !file)} aria-label="Gửi"><ArrowUp size={23} aria-hidden="true" /></button>
        </div>
        {ready && !modelEnabled && <p className="pc-chat-footnote">Trợ lý đang dùng hướng dẫn có sẵn.</p>}
      </form>
    </section>
  </section>;
}
