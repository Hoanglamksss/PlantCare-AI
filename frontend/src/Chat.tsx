import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUp, Camera, ChevronDown, ChevronRight, Leaf, Sprout } from 'lucide-react';
import { cropLabels, displayError, request, type CropCode, type Session } from './api';
import { ErrorNotice } from './ui';
import './chat.css';

type Reply = { text: string; source: { title: string; url: string } | null; photoSuggested: boolean; speciesCode: CropCode | null };
type Exchange = { question: string; reply: Reply | null };
const cropQuestions: Record<CropCode, string[]> = {
  tomato: ['Cà chua bị đốm nâu, nên kiểm tra gì?', 'Cà chua tưới thế nào khi lá héo?'],
  cucumber: ['Dưa leo có mảng trắng trên lá thì làm gì?', 'Tưới dưa leo thế nào?'],
  chili: ['Ớt có lá xoăn và rệp, nên xử lý thế nào?', 'Lá ớt bị đốm nâu thì làm gì?'],
  basil: ['Húng quế có lá vàng và mốc ở mặt dưới?', 'Tưới và đặt chậu húng quế ở đâu?'],
  mint: ['Bạc hà có đốm màu gỉ sắt thì làm gì?', 'Bạc hà héo khi đất còn ướt thì xử lý thế nào?'],
};

export function Chat({ session, onExpired, initialCrop }: { session: Session; onExpired: () => void; initialCrop?: CropCode }) {
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState('');
  const [crop, setCrop] = useState<CropCode | ''>(initialCrop ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const quickQuestions = crop ? cropQuestions[crop] : ['Cà chua bị đốm nâu, nên kiểm tra gì?', 'Húng quế có lá vàng và mốc ở mặt dưới?', 'Làm sao nhận biết rệp?'];

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (history.current && messages.length) history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);

  async function ask(raw: string) {
    const query = raw.trim();
    if (query.length < 2 || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setQuestion('');
    setMessages((current) => [...current.slice(-24), { question: query, reply: null }]);
    try {
      const reply = await request<Reply>('/chat', {
        method: 'POST', body: { question: query, ...(crop ? { speciesCode: crop } : {}) },
        csrfToken: session.csrfToken, signal: controller.signal,
      });
      setMessages((current) => [...current.slice(0, -1), { question: query, reply }]);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setMessages((current) => current.slice(0, -1));
        setQuestion(query);
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

  return (
    <section className="pc-chat" aria-labelledby="chat-title">
      <header className="pc-chat-header">
        <span className="pc-chat-avatar" aria-hidden="true"><Leaf size={26} strokeWidth={1.6} /></span>
        <div><h1 id="chat-title">Trợ lý PlantCare</h1><p>Cùng bạn chăm cây mỗi ngày</p></div>
      </header>
      <div className="pc-chat-context">
        <span className="pc-chat-context-icon" aria-hidden="true"><Sprout size={23} strokeWidth={1.6} /></span>
        <label>
          <span>{crop ? 'Đang trò chuyện về' : 'Chọn cây để được gợi ý phù hợp'}</span>
          <span className="pc-chat-select-wrap"><select aria-label="Loại cây đang tư vấn" value={crop} onChange={(event) => setCrop(event.target.value as CropCode | '')} disabled={busy}>
            <option value="">Tất cả cây trồng</option>{Object.entries(cropLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select><ChevronDown size={16} aria-hidden="true" /></span>
        </label>
      </div>
      <section className="pc-chat-conversation" aria-label="Trò chuyện">
          <div className="pc-chat-history" role="log" aria-label="Tin nhắn" aria-live="polite" ref={history}>
            <div className="pc-chat-welcome pc-chat-answer"><p>Chào bạn! {crop ? `Mình có thể giúp bạn chăm ${cropLabels[crop].toLocaleLowerCase('vi-VN')}.` : 'Mình là trợ lý PlantCare.'} Hãy kể mình nghe cây của bạn đang cần gì nhé.</p></div>
            {messages.map(({ question: prompt, reply }, index) => (
              <div className="pc-chat-exchange" key={`${index}-${prompt}`}>
                <p className="pc-chat-question">{prompt}</p>
                <div className={`pc-chat-answer${reply ? '' : ' pc-chat-answer-pending'}`}>
                  <p>{reply?.text ?? 'Đang tìm hướng dẫn…'}</p>
                  {reply?.source && <a href={reply.source.url} target="_blank" rel="noreferrer">{reply.source.title}<ChevronRight size={15} aria-hidden="true" /></a>}
                </div>
                {reply?.photoSuggested && <a className="pc-chat-scan" href={reply.speciesCode ? `#scan?crop=${reply.speciesCode}` : '#scan'}><Camera size={17} aria-hidden="true" /> Kiểm tra ảnh lá<ChevronRight size={15} aria-hidden="true" /></a>}
              </div>
            ))}
          </div>
          <aside className="pc-chat-suggestions" aria-labelledby="pc-chat-suggestions-title">
            <h2 id="pc-chat-suggestions-title">{messages.length ? 'Hỏi thêm về cây' : 'Bạn có thể hỏi'}</h2>
            <div>{quickQuestions.map((prompt) => <button key={prompt} disabled={busy} onClick={() => void ask(prompt)}>{prompt}<ChevronRight size={16} aria-hidden="true" /></button>)}</div>
          </aside>
          <form className="pc-chat-form" onSubmit={submit}>
            <ErrorNotice message={error} />
            <div className="pc-chat-compose"><label><span className="pc-chat-sr">Câu hỏi chăm sóc cây</span><textarea rows={1} maxLength={600} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi cách chăm cây…" /></label>
              <button type="submit" disabled={busy || question.trim().length < 2} aria-label="Gửi câu hỏi"><ArrowUp size={23} strokeWidth={1.7} aria-hidden="true" /></button></div>
            <p className="pc-chat-footnote">Gợi ý từ các hướng dẫn chăm cây đã chọn.</p>
          </form>
      </section>
    </section>
  );
}
