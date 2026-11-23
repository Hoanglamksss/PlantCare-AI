import { useEffect, useState } from 'react';
import { ApiError, displayError, request, type Session } from './api';
import { ErrorNotice } from './ui';

type Result = {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  retryable: boolean;
  findings: { code: string; label: string; detail: string }[];
  guidance: { recommendation: string; possibleCauses: { label: string; detail: string }[] } | null;
  plan: { when: string; steps: string[] }[];
};

export function ChatScreening({ id, session, onExpired, onFocus }: { id: string; session: Session; onExpired: () => void; onFocus: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 90_000;
    async function load() {
      try {
        const next = await request<Result>(`/chat/screening/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult(next);
        if (next.status === 'queued' || next.status === 'processing') {
          if (Date.now() < deadline) timer = setTimeout(() => void load(), 4_000);
          else setError('Ảnh vẫn đang chờ xử lý. Bạn có thể tải lại kết quả.');
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 404) setMissing(true);
        setError(displayError(failure, onExpired));
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, onExpired, refresh]);

  async function retry() {
    setRetrying(true);
    setError('');
    try {
      await request(`/diagnoses/${id}/retry`, { method: 'POST', csrfToken: session.csrfToken });
      setResult(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setRetrying(false);
    }
  }

  return <div className="pc-chat-screening">
    {!missing && <img className="pc-chat-photo" src={`/api/v1/diagnoses/${id}/photo`} alt="Ảnh lá cây đã gửi để sàng lọc" loading="lazy" />}
    <ErrorNotice message={error} />
    {error && !missing && <button type="button" className="text-button" onClick={() => { setError(''); setRefresh((value) => value + 1); }}>Tải lại kết quả</button>}
    {!error && (!result || result.status === 'queued' || result.status === 'processing') && <p>Đang phân tích ảnh…</p>}
    {result?.status === 'failed' && <>
      <p>Chưa xử lý được ảnh. {result.retryable ? 'Hãy thử lại.' : 'Hãy tải ảnh khác.'}</p>
      {result.retryable && <button type="button" className="text-button" disabled={retrying} onClick={() => void retry()}>Thử phân tích lại</button>}
    </>}
    {result?.status === 'completed' && result.guidance && <>
      <strong>Kết quả sàng lọc dấu hiệu</strong>
      <p>{result.guidance.recommendation}</p>
      {result.findings.length > 0 && <ul>{result.findings.map((item) => <li key={item.code}>{item.label}: {item.detail}</li>)}</ul>}
      {result.guidance.possibleCauses.length > 0 && <>
        <strong>Khả năng cần đối chiếu</strong>
        <ul>{result.guidance.possibleCauses.map((cause) => <li key={cause.label}>{cause.label}: {cause.detail}</li>)}</ul>
      </>}
      <button type="button" className="text-button" onClick={onFocus}>Hỏi về ảnh này</button>
      <strong>Việc cần làm</strong>
      <ul className="pc-chat-plan">{result.plan.map((day) => <li key={day.when}><strong>{day.when}</strong> {day.steps.join(' ')}</li>)}</ul>
    </>}
  </div>;
}
