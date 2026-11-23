import { useEffect, useState, type FormEvent } from 'react';
import { displayError, request, type Session } from './api';
import { useEmailCodeCooldown } from './email-code';
import { maskEmail } from './email';
import { ErrorNotice } from './ui';

type Status = { verified: boolean; enabled: boolean };

export function EmailVerification({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const csrfToken = session.csrfToken;
  const cooldown = useEmailCodeCooldown(session.user.email);

  useEffect(() => {
    const controller = new AbortController();
    request<Status>('/auth/email-verification', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setStatus(data); })
      .catch((failure) => { if (!controller.signal.aborted) setError(displayError(failure, onExpired)); });
    return () => controller.abort();
  }, [onExpired, version]);

  async function submit(action: 'send' | 'confirm') {
    if (busy || (action === 'send' && cooldown.remaining)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<{ verified: boolean }>(`/auth/email-verification/${action}`, {
        method: 'POST', csrfToken, ...(action === 'confirm' && { body: { code } }),
      });
      if (result.verified) {
        setStatus((current) => current && { ...current, verified: true });
        setCode('');
      } else {
        if (action === 'send') cooldown.start();
        setNotice('Đã gửi mã. Kiểm tra hộp thư đến hoặc thư rác.');
      }
    } catch (failure) {
      if (action === 'send') cooldown.handleLimit(failure);
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    void submit('confirm');
  }

  return <section className="profile-settings" aria-labelledby="email-verification-title">
    <h2 id="email-verification-title">Xác minh email</h2>
    <ErrorNotice message={error} />
    {!status && (error
      ? <button type="button" className="text-button" onClick={() => { setError(''); setVersion((value) => value + 1); }}>Tải lại</button>
      : <p role="status">Đang kiểm tra trạng thái xác minh…</p>)}
    {status?.verified && <p role="status">Email đã được xác minh.</p>}
    {status && !status.verified && <>
      {!status.enabled && <p>Gửi mã xác minh hiện chưa khả dụng.</p>}
      {status.enabled && <form className="form-stack" onSubmit={confirm}>
        <p>Mã được gửi đến <strong>{maskEmail(session.user.email)}</strong> và có hiệu lực 10 phút.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        <label className="field">Mã 6 chữ số<input type="text" inputMode="numeric" autoComplete="one-time-code"
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} /></label>
        <div className="form-actions">
          <button type="button" className="button button-secondary" disabled={busy || cooldown.remaining > 0} onClick={() => void submit('send')}>
            {cooldown.remaining ? `Gửi lại sau ${cooldown.remaining} giây` : 'Gửi mã'}
          </button>
          <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>Xác minh</button>
        </div>
      </form>}
    </>}
  </section>;
}
