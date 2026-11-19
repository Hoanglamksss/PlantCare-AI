import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, ChevronRight, ImagePlus, LockKeyhole, LogOut, UserRound } from 'lucide-react';
import { displayError, request, type AccountProfile, type Session } from './api';
import { acceptedPhotoTypes, readPhoto, usePhotoPreview, validatePhoto } from './photo';
import { Dialog, ErrorNotice } from './ui';
import { newPasswordError } from './password';
import './profile.css';

export function AccountAvatar({ url, className }: { url?: string | null; className?: string }) {
  return <AvatarImage key={url} url={url} className={className} />;
}

function AvatarImage({ url, className }: { url?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`profile-avatar${className ? ` ${className}` : ''}`} aria-hidden="true">
    {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <UserRound />}
  </span>;
}

interface Props {
  session: Session;
  profile?: AccountProfile;
  loadError?: string;
  logoutError: string;
  loggingOut: boolean;
  onRetry: () => void;
  onLogout: () => void;
  onExpired: () => void;
  onSaved: (profile: AccountProfile) => void;
  onCredentialsChanged: () => void;
}

export function ProfileSettings({ session, profile, loadError, logoutError, loggingOut, onRetry, onLogout, onExpired, onSaved, onCredentialsChanged }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [action, setAction] = useState<'details' | 'avatar' | 'remove' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const preview = usePhotoPreview(file);
  const picker = useRef<HTMLInputElement>(null);
  const csrfToken = session.csrfToken;

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action) return;
    const fields = new FormData(event.currentTarget);
    const displayName = String(fields.get('displayName') ?? '').trim() || null;
    const phone = String(fields.get('phone') ?? '').trim() || null;
    setAction('details'); setNotice(''); setError('');
    try {
      onSaved(await request<AccountProfile>('/profile', { method: 'PATCH', csrfToken, body: { displayName, phone } }));
      setNotice('Đã lưu thông tin hồ sơ.');
      setDetailsOpen(false);
    } catch (failure) { setError(displayError(failure, onExpired)); } finally { setAction(null); }
  }

  async function saveAvatar(remove = false) {
    if (action || (!remove && !file)) return;
    setAction(remove ? 'remove' : 'avatar'); setError(''); setNotice('');
    try {
      if (remove) {
        await request('/profile/avatar', { method: 'DELETE', csrfToken });
        if (profile) onSaved({ ...profile, avatarUrl: null });
      } else if (file) {
        const body = new FormData();
        body.set('image', file);
        onSaved(await request<AccountProfile>('/profile/avatar', { method: 'PUT', csrfToken, body }));
      }
      setFile(null);
      setNotice(remove ? 'Đã bỏ ảnh đại diện.' : 'Đã cập nhật ảnh đại diện.');
      setAvatarOpen(false);
    } catch (failure) { setError(displayError(failure, onExpired)); } finally { setAction(null); }
  }

  function openEditor(kind: 'details' | 'avatar' | 'credentials') {
    setError('');
    setNotice('');
    if (kind === 'details') setDetailsOpen(true);
    if (kind === 'avatar') setAvatarOpen(true);
    if (kind === 'credentials') setCredentialsOpen(true);
  }

  return <div className="profile-page">
    <header className="profile-page-heading"><h1>Hồ sơ</h1></header>
    {!detailsOpen && !avatarOpen && <ErrorNotice message={error} />}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!profile && (loadError ? <><ErrorNotice message={loadError} /><button className="button button-secondary" type="button" onClick={onRetry}>Thử tải hồ sơ</button></> : <p role="status">Đang tải hồ sơ…</p>)}
    {profile && <>
      <section className="profile-identity" aria-label="Thông tin tài khoản">
        <button className="profile-avatar-button" type="button" onClick={() => openEditor('avatar')} aria-label="Thay đổi ảnh đại diện">
          <AccountAvatar url={profile.avatarUrl} className="profile-avatar-large" />
          <span className="profile-avatar-camera"><Camera size={13} aria-hidden="true" /></span>
        </button>
        <div className="profile-identity-text">
          <h2>{profile.displayName || 'Người trồng cây'}</h2>
          <p>{profile.email}</p>
          <span className="profile-role">{session.user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</span>
        </div>
      </section>
      <section className="profile-settings" aria-labelledby="profile-settings-heading">
        <h2 id="profile-settings-heading">Cài đặt</h2>
        <div className="profile-settings-list">
          <button type="button" className="profile-setting-row" onClick={() => openEditor('details')}>
            <span className="profile-setting-icon"><UserRound size={21} aria-hidden="true" /></span>
            <span><strong>Thông tin cá nhân</strong><small>Tên hiển thị và số điện thoại</small></span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
          <button type="button" className="profile-setting-row" onClick={() => openEditor('avatar')}>
            <span className="profile-setting-icon"><ImagePlus size={21} aria-hidden="true" /></span>
            <span><strong>Ảnh đại diện</strong><small>Chọn hình ảnh cho hồ sơ của bạn</small></span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
          <button type="button" className="profile-setting-row" onClick={() => openEditor('credentials')} disabled={loggingOut}>
            <span className="profile-setting-icon"><LockKeyhole size={21} aria-hidden="true" /></span>
            <span><strong>Đăng nhập và bảo mật</strong><small>Đổi email hoặc mật khẩu</small></span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
      </section>
    </>}
    <div className="profile-logout">
      <ErrorNotice message={logoutError} />
      <button type="button" className="button profile-logout-button" onClick={onLogout} disabled={loggingOut || !!action}><LogOut size={18} aria-hidden="true" />{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
    </div>
    {detailsOpen && profile && <Dialog title="Thông tin cá nhân" busy={!!action} onDismiss={() => setDetailsOpen(false)}>
      <div className="profile-editor">
        <ErrorNotice message={error} />
        <form key={`${profile.displayName ?? ''}|${profile.phone ?? ''}`} onSubmit={(event) => void saveDetails(event)}>
          <fieldset disabled={!!action} className="form-stack">
            <label className="field">Tên hiển thị<input name="displayName" autoComplete="nickname" maxLength={80} defaultValue={profile.displayName ?? ''} placeholder="Tên bạn muốn hiển thị" /></label>
            <label className="field">Số điện thoại<input name="phone" type="tel" autoComplete="tel" maxLength={32} defaultValue={profile.phone ?? ''} placeholder="Ví dụ 0912 345 678" /></label>
            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setDetailsOpen(false)}>Hủy</button>
              <button className="button button-primary" type="submit">{action === 'details' ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
            </div>
          </fieldset>
        </form>
      </div>
    </Dialog>}
    {avatarOpen && profile && <Dialog title="Ảnh đại diện" busy={!!action} onDismiss={() => { setAvatarOpen(false); setFile(null); }}>
      <div className="profile-editor profile-avatar-editor">
        <AccountAvatar url={preview || profile.avatarUrl} className="profile-avatar-preview" />
        <ErrorNotice message={error} />
        <input hidden type="file" accept={acceptedPhotoTypes} ref={picker} aria-label="Chọn ảnh đại diện" onChange={(event) => {
              const photo = readPhoto(event.currentTarget);
              if (!photo) return;
              const issue = validatePhoto(photo);
              setFile(issue ? null : photo);
              setNotice(''); setError(issue);
        }} />
        <div className="profile-actions">
              <button className="button button-secondary" type="button" disabled={!!action} onClick={() => picker.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Chọn ảnh</button>
              {file ? <>
                <button className="button button-primary" type="button" disabled={!!action} onClick={() => void saveAvatar()}>{action === 'avatar' ? 'Đang lưu…' : 'Lưu ảnh'}</button>
                <button className="text-button" type="button" disabled={!!action} onClick={() => setFile(null)}>Hủy ảnh đã chọn</button>
              </> : profile.avatarUrl && <button className="text-button" type="button" disabled={!!action} onClick={() => void saveAvatar(true)}>Bỏ ảnh đại diện</button>}
        </div>
      </div>
    </Dialog>}
    {credentialsOpen && profile && <CredentialsDialog email={profile.email} csrfToken={csrfToken} onExpired={onExpired}
      onClose={() => setCredentialsOpen(false)} onSaved={onCredentialsChanged} />}
  </div>;
}

function CredentialsDialog({ email, csrfToken, onClose, onSaved, onExpired }: {
  email: string; csrfToken: string; onClose: () => void; onSaved: () => void; onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function changeCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const nextEmail = String(fields.get('email') ?? '').trim().toLowerCase();
    const currentPassword = String(fields.get('currentPassword') ?? '');
    const newPassword = String(fields.get('newPassword') ?? '');
    const passwordError = newPasswordError(newPassword, true);
    if (passwordError) { setError(passwordError); return; }
    if (newPassword !== String(fields.get('confirmation') ?? '')) { setError('Hai lần nhập mật khẩu mới chưa khớp.'); return; }
    if (nextEmail === email && !newPassword) { setError('Hãy nhập email mới hoặc mật khẩu mới.'); return; }
    setBusy(true); setError('');
    try {
      await request('/profile/credentials', {
        method: 'PATCH', csrfToken, body: { currentPassword, ...(nextEmail !== email && { email: nextEmail }), ...(newPassword && { newPassword }) },
      });
      onSaved();
    } catch (failure) { setError(displayError(failure, onExpired)); } finally { setBusy(false); }
  }

  return <Dialog title="Đổi email hoặc mật khẩu" busy={busy} onDismiss={onClose}>
    <p className="muted profile-dialog-copy">Sau khi lưu, bạn sẽ cần đăng nhập lại trên các thiết bị đang dùng.</p>
    <ErrorNotice message={error} />
    <form onSubmit={(event) => void changeCredentials(event)}><fieldset disabled={busy} className="form-stack">
      <label className="field">Email đăng nhập<input name="email" type="email" autoComplete="username" maxLength={254} defaultValue={email} required /></label>
      <label className="field">Mật khẩu hiện tại<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
      <label className="field">Mật khẩu mới<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128}
        onInvalid={(event) => event.currentTarget.setCustomValidity(newPasswordError(event.currentTarget.value, true))}
        onChange={(event) => event.currentTarget.setCustomValidity('')} />
        <span className="field-hint">Dùng ít nhất 12 ký tự nếu đổi mật khẩu.</span></label>
      <label className="field">Nhập lại mật khẩu mới<input name="confirmation" type="password" autoComplete="new-password" maxLength={128} /></label>
      <div className="form-actions"><button className="button button-secondary" type="button" onClick={onClose}>Hủy</button>
        <button className="button button-primary" type="submit">{busy ? 'Đang cập nhật…' : 'Lưu và đăng nhập lại'}</button></div>
    </fieldset></form>
  </Dialog>;
}
