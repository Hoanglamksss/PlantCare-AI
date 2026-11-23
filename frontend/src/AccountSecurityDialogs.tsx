import { useRef, useState, type FormEvent } from 'react';
import { displayError, request } from './api';
import { useEmailCodeCooldown } from './email-code';
import { maskEmail } from './email';
import { newPasswordError } from './password';
import { Dialog, ErrorNotice } from './ui';

type Controls = {
  csrfToken: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
};

function CurrentPassword() {
  return <label className="field">Mật khẩu hiện tại
    <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
  </label>;
}

export function ChangePasswordDialog({ csrfToken, onClose, onSaved, onExpired }: Controls) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const currentPassword = String(fields.get('currentPassword') ?? '');
    const newPassword = String(fields.get('newPassword') ?? '');
    const issue = newPasswordError(newPassword);
    if (issue) { setError(issue); return; }
    if (newPassword !== fields.get('confirmation')) { setError('Hai lần nhập mật khẩu mới chưa khớp.'); return; }
    setBusy(true);
    setError('');
    try {
      await request('/profile/credentials', { method: 'PATCH', csrfToken, body: { currentPassword, newPassword } });
      onSaved();
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title="Đổi mật khẩu" busy={busy} onDismiss={onClose}>
    <p className="muted profile-dialog-copy">Sau khi lưu, hãy đăng nhập lại bằng mật khẩu mới.</p>
    <ErrorNotice message={error} />
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} className="form-stack">
        <CurrentPassword />
        <label className="field">Mật khẩu mới
          <input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
            onInvalid={(event) => event.currentTarget.setCustomValidity(newPasswordError(event.currentTarget.value))}
            onChange={(event) => event.currentTarget.setCustomValidity('')} />
          <span className="field-hint">Dùng ít nhất 12 ký tự.</span>
        </label>
        <label className="field">Nhập lại mật khẩu mới
          <input name="confirmation" type="password" autoComplete="new-password" required maxLength={128} />
        </label>
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Hủy</button>
          <button className="button button-primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
        </div>
      </fieldset>
    </form>
  </Dialog>;
}

export function ChangeEmailDialog({ email, csrfToken, onClose, onSaved, onExpired }: Controls & { email: string }) {
  const [emailInput, setEmailInput] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const nextEmail = emailInput.trim().toLowerCase();
  const cooldown = useEmailCodeCooldown(nextEmail);
  const busy = sending || saving;

  async function sendCode(currentPassword: string) {
    if (busy || cooldown.remaining) return;
    if (nextEmail === email.toLowerCase()) { setError('Hãy nhập địa chỉ email mới.'); return; }
    setSending(true);
    setError('');
    try {
      const result = await request<{ challengeId: string }>('/profile/credentials/email/send', {
        method: 'POST', csrfToken, body: { email: nextEmail, currentPassword },
      });
      setChallengeId(result.challengeId);
      setCode('');
      cooldown.start();
    } catch (failure) {
      cooldown.handleLimit(failure);
      setError(displayError(failure, onExpired));
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const currentPassword = String(new FormData(event.currentTarget).get('currentPassword') ?? '');
    if (!challengeId) { await sendCode(currentPassword); return; }
    setSaving(true);
    setError('');
    try {
      await request('/profile/credentials', {
        method: 'PATCH', csrfToken, body: { email: nextEmail, currentPassword, challengeId, code },
      });
      onSaved();
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setSaving(false);
    }
  }

  function resend() {
    const password = form.current?.elements.namedItem('currentPassword');
    if (!(password instanceof HTMLInputElement) || !password.reportValidity()) return;
    void sendCode(password.value);
  }

  const sendLabel = cooldown.remaining ? `Gửi lại sau ${cooldown.remaining} giây` : 'Gửi mã xác minh';
  return <Dialog title="Đổi email" busy={busy} onDismiss={onClose}>
    <p className="muted profile-dialog-copy">Email hiện tại <strong>{maskEmail(email)}</strong></p>
    <ErrorNotice message={error} />
    <form ref={form} onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} className="form-stack">
        {!challengeId && <label className="field">Email mới
          <input name="newEmail" type="email" autoComplete="off" maxLength={254} value={emailInput} required
            onChange={(event) => { setEmailInput(event.target.value); setError(''); }} />
        </label>}
        <CurrentPassword />
        {challengeId && <>
          <p className="notice" role="status">Mã đã gửi đến <strong>{maskEmail(nextEmail)}</strong> và có hiệu lực 10 phút.</p>
          <label className="field">Mã xác minh email mới
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6}
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          <div className="profile-actions">
            <button type="button" className="text-button" onClick={() => { setChallengeId(null); setCode(''); setError(''); }}>Sửa email mới</button>
            <button type="button" className="text-button" disabled={cooldown.remaining > 0} onClick={resend}>
              {cooldown.remaining ? sendLabel : 'Gửi lại mã'}
            </button>
          </div>
        </>}
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Hủy</button>
          <button className="button button-primary" type="submit" disabled={!challengeId && cooldown.remaining > 0}>
            {sending ? 'Đang gửi mã…' : saving ? 'Đang lưu…' : challengeId ? 'Xác minh và đổi email' : sendLabel}
          </button>
        </div>
      </fieldset>
    </form>
  </Dialog>;
}
