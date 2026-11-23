import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Leaf, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import { displayError, request, type Session } from './api';
import { useEmailCodeCooldown } from './email-code';
import { maskEmail } from './email';
import { Brand, ErrorNotice } from './ui';
import { newPasswordError } from './password';
import indoorPlant from './assets/indoor-monstera.webp';
import './auth.css';

export function AuthForm({ initialNotice, description, onLogin }: {
  initialNotice?: string;
  description?: string;
  onLogin: (session: Session) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState(initialNotice ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const verifyingEmail = isRegister && Boolean(challenge) && !editingDetails;
  const passwordError = isRegister ? newPasswordError(password) : '';
  const cooldown = useEmailCodeCooldown(email);

  function changeMode() {
    setMode(isRegister ? 'login' : 'register');
    setChallenge(null);
    setCode('');
    setEditingDetails(false);
    setPassword('');
    setPhone('');
    setDisplayName('');
    setShowPassword(false);
    setError('');
    setNotice('');
  }

  async function sendCode() {
    const result = await request<{ challengeId: string }>('/auth/register/send', {
      method: 'POST', body: { email: email.trim() },
    }).catch((failure: unknown) => {
      cooldown.handleLimit(failure);
      throw failure;
    });
    cooldown.start();
    setChallenge(result.challengeId);
    setEditingDetails(false);
    setCode('');
    setNotice('Nếu đây là email đăng ký mới, hãy kiểm tra hộp thư đến hoặc thư rác. Mã có hiệu lực 10 phút.');
  }

  async function resend() {
    if (busy || cooldown.remaining) return;
    setBusy(true);
    setError('');
    try { await sendCode(); } catch (failure) { setError(displayError(failure)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (isRegister && !challenge && cooldown.remaining)) return;
    if (isRegister && !displayName.trim()) { setError('Hãy nhập tên bạn muốn hiển thị.'); return; }
    if (isRegister && passwordError) { setError(passwordError); return; }
    setBusy(true);
    setError('');
    setNotice('');
    const credentials = { email: email.trim(), password };
    try {
      if (isRegister) {
        if (!challenge) { await sendCode(); return; }
        if (editingDetails) { setEditingDetails(false); return; }
        const result = await request<{ message: string }>('/auth/register', {
          method: 'POST', body: { ...credentials, challengeId: challenge, code, ...(phone.trim() && { phone: phone.trim() }), ...(displayName.trim() && { displayName: displayName.trim() }) },
        });
        setMode('login');
        setChallenge(null);
        setCode('');
        setPassword('');
        setPhone('');
        setDisplayName('');
        setShowPassword(false);
        setNotice(result.message);
      } else {
        onLogin(await request<Session>('/auth/login', { method: 'POST', body: credentials }));
      }
    } catch (failure) {
      setError(displayError(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-form" data-mode={mode}>
    {!isRegister && <div className="auth-photo">
      <img src={indoorPlant} alt="Chậu trầu bà xanh trong góc nhà đầy nắng" width={1122} height={1402} fetchPriority="high" />
      <a className="auth-photo-brand" href="#home" aria-label="PlantCare AI · Trang chủ"><Brand /></a>
    </div>}
    <div className="auth-form-body">
      {isRegister && <button className="auth-back" type="button" onClick={changeMode} disabled={busy}><ArrowLeft size={21} aria-hidden="true" /> Tạo tài khoản</button>}
      {isRegister && <span className="auth-leaf" aria-hidden="true"><Leaf size={29} strokeWidth={1.5} /></span>}
      <h1>{verifyingEmail ? 'Xác minh email' : isRegister ? <>Một khu vườn nhỏ.<br />Khởi đầu từ bạn.</> : <>Chăm cây xanh,<br />nuôi an lành.</>}</h1>
      {isRegister && <ol className="auth-register-steps" aria-label="Các bước đăng ký">
        <li aria-current={!verifyingEmail ? 'step' : undefined}>1. Thông tin tài khoản</li>
        <li aria-current={verifyingEmail ? 'step' : undefined}>2. Xác minh email</li>
      </ol>}
      <p className="auth-description">{verifyingEmail ? <>Nhập mã 6 số từ hộp thư <strong>{maskEmail(email.trim())}</strong> để tạo tài khoản.</>
        : isRegister ? 'Xác minh email bằng mã OTP để hoàn tất đăng ký.' : description ?? 'Đăng nhập để cùng cây lớn lên mỗi ngày.'}</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <ErrorNotice message={error} />
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="form-stack">
          {!verifyingEmail && <>
          {isRegister && <label className="field">Tên của bạn
            <span className="auth-input-wrap"><UserRound size={19} aria-hidden="true" />
              <input name="displayName" autoComplete="nickname" placeholder="Bạn muốn được gọi là gì?" required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </span>
          </label>}
          <label className="field">Email
            <span className="auth-input-wrap"><Mail size={19} aria-hidden="true" />
              <input type="email" name="email" autoComplete="username" placeholder="ban@email.com" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setChallenge(null); setCode(''); setNotice(''); }} />
            </span>
          </label>
          {isRegister && <label className="field">Số điện thoại <span className="field-hint">Tùy chọn</span>
            <span className="auth-input-wrap"><Phone size={19} aria-hidden="true" />
              <input type="tel" name="phone" autoComplete="tel" placeholder="0912 345 678" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </span>
          </label>}
          <label className="field">Mật khẩu
            <span className="auth-input-wrap auth-password"><LockKeyhole size={19} aria-hidden="true" />
              <input type={showPassword ? 'text' : 'password'} name="password" autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? 'Tối thiểu 12 ký tự' : 'Nhập mật khẩu của bạn'} required minLength={isRegister ? 12 : undefined} maxLength={128}
                value={password} aria-invalid={isRegister && !!password && !!passwordError || undefined}
                onInvalid={(event) => event.currentTarget.setCustomValidity(isRegister ? newPasswordError(event.currentTarget.value) : 'Vui lòng nhập mật khẩu.')}
                onChange={(event) => { event.currentTarget.setCustomValidity(''); setPassword(event.target.value); }} />
              <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
                {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
              </button>
            </span>
            {isRegister && <span className="field-hint password-feedback" data-valid={!password ? undefined : !passwordError} aria-live="polite">
              {!password ? 'Dùng ít nhất 12 ký tự để bảo vệ khu vườn của bạn.' : passwordError || 'Độ dài mật khẩu hợp lệ.'}
            </span>}
          </label>
          </>}
          {verifyingEmail && <>
            <label className="field">Mã xác minh email
              <input name="code" autoFocus maxLength={6} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required
                value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <div className="auth-otp-actions">
              <button type="button" className="text-button" onClick={() => { setEditingDetails(true); setError(''); setNotice(''); }}>Sửa thông tin</button>
              <button type="button" className="text-button" disabled={cooldown.remaining > 0} onClick={() => void resend()}>
                {cooldown.remaining ? `Gửi lại sau ${cooldown.remaining} giây` : 'Gửi lại mã'}
              </button>
            </div>
          </>}
          {isRegister && !challenge && cooldown.remaining > 0 && <p className="field-hint">Có thể gửi lại sau {cooldown.remaining} giây.</p>}
          <button type="submit" className="button button-primary auth-submit" disabled={isRegister && !challenge && cooldown.remaining > 0}>{busy ? 'Đang xử lý…' : isRegister ? verifyingEmail ? 'Xác minh và tạo tài khoản' : challenge ? 'Tiếp tục xác minh' : 'Gửi mã xác minh' : 'Đăng nhập'}</button>
        </fieldset>
      </form>
      <div className="auth-toggle">
        <span>{isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}</span>
        <button type="button" className="text-button" disabled={busy} onClick={changeMode}>{isRegister ? 'Đăng nhập' : 'Đăng ký'}</button>
      </div>
      <a className="auth-home-link" href="#home">Khám phá PlantCare AI</a>
    </div>
  </div>;
}
