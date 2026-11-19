import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Camera, Leaf, LogIn, MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { ApiError, displayError, isCropCode, request } from './api';
import type { AccountProfile, CropCode, Plant, Session } from './api';
import { Chat } from './Chat';
import { Community } from './Community';
import { Diagnosis } from './Diagnosis';
import { Garden } from './Garden';
import { Home } from './Home';
import { AccountAvatar, ProfileSettings } from './ProfileSettings';
import { AuthForm } from './AuthForm';
import { Brand, ErrorNotice } from './ui';
import { Schedule } from './Schedule';
import { AdminPanel } from './AdminPanel';
import { Notifications } from './Notifications';

export type Page = 'home' | 'garden' | 'schedule' | 'scan' | 'chat' | 'profile' | 'settings' | 'community' | 'login' | 'admin';

const navigation = [
  { page: 'home', label: 'Vườn cây', icon: Leaf },
  { page: 'schedule', label: 'Đặt lịch', icon: CalendarClock },
  { page: 'scan', label: 'Chẩn đoán', icon: Camera },
  { page: 'chat', label: 'Trợ lý AI', icon: MessageCircle },
  { page: 'community', label: 'Cộng đồng', icon: UsersRound },
] as const;

const privatePageDescriptions: Partial<Record<Page, string>> = {
  garden: 'Đăng nhập để mở hồ sơ cây và nhật ký chăm sóc của bạn.',
  schedule: 'Đăng nhập để đặt lịch chăm sóc cho từng cây.',
  scan: 'Đăng nhập để kiểm tra ảnh lá và xem lại kết quả của bạn.',
  chat: 'Đăng nhập để đặt câu hỏi chăm sóc cây.',
  profile: 'Đăng nhập để quản lý hồ sơ và thông tin tài khoản của bạn.',
  settings: 'Đăng nhập để quản lý hồ sơ và thông tin tài khoản của bạn.',
  community: 'Đăng nhập để xem cây được chia sẻ và tham gia trao đổi.',
  admin: 'Đăng nhập bằng tài khoản Admin để quản trị hệ thống.',
};

function readRoute() {
  const [hash, query] = window.location.hash.slice(1).split('?', 2);
  const params = new URLSearchParams(query);
  const page: Page = hash === 'settings' ? 'profile' : hash === 'garden' || hash === 'login' || hash === 'profile' || hash === 'admin' ? hash : navigation.find((entry) => entry.page === hash)?.page ?? 'home';
  const plantId = params.get('plant');
  const crop = params.get('crop');
  return { page, crop: isCropCode(crop) ? crop : undefined,
    adding: params.get('add') === 'true',
    plantId: plantId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(plantId) ? plantId : undefined };
}

type AuthState =
  | { status: 'loading' }
  | { status: 'guest'; notice?: string }
  | { status: 'error'; message: string }
  | { status: 'authenticated'; session: Session };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [route, setRoute] = useState(readRoute);
  const { page } = route;
  const [checkVersion, setCheckVersion] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [profileLoad, setProfileLoad] = useState<{ owner: string; profile?: AccountProfile; error?: string }>();
  const [profileVersion, setProfileVersion] = useState(0);
  const main = useRef<HTMLElement>(null);
  const lastPage = useRef(page);
  const session = auth.status === 'authenticated' ? auth.session : undefined;
  const latestSession = useRef(session);
  latestSession.current = session;

  const navigate = useCallback((destination: Page, query?: URLSearchParams) => {
    const hash = `#${destination}${query ? `?${query.toString()}` : ''}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(readRoute());
  }, []);

  const scanPlant = useCallback((plant: Pick<Plant, 'id'>) => {
    navigate('scan', new URLSearchParams({ plant: plant.id }));
  }, [navigate]);

  const exploreCrop = useCallback((crop: CropCode) => {
    navigate('chat', new URLSearchParams({ crop }));
  }, [navigate]);

  useEffect(() => {
    const handleHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    void request<Session>('/auth/me', { signal: controller.signal })
      .then((session) => {
        if (!controller.signal.aborted) setAuth({ status: 'authenticated', session });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuth({ status: 'guest' });
        } else {
          setAuth({ status: 'error', message: displayError(error) });
        }
      });
    return () => controller.abort();
  }, [checkVersion]);

  const expireSession = useCallback(() => {
    if (!session || latestSession.current !== session) return;
    setLogoutError('');
    setProfileLoad(undefined);
    setAuth({ status: 'guest', notice: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }, [session]);

  async function logout(session: Session) {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await request('/auth/logout', { method: 'POST', csrfToken: session.csrfToken });
      setProfileLoad(undefined);
      setAuth({ status: 'guest' });
      navigate('home');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expireSession();
      else setLogoutError(displayError(error));
    } finally {
      setLoggingOut(false);
    }
  }

  const accountId = session?.user.id;
  const currentProfile = profileLoad?.owner === accountId ? profileLoad : undefined;
  const profile = currentProfile?.profile;
  const controls = session && { csrfToken: session.csrfToken, onExpired: expireSession };
  const visiblePage = session && page === 'login' ? 'profile' : page;

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void request<AccountProfile>('/profile', { signal: controller.signal }).then((loaded) => {
      if (!controller.signal.aborted) setProfileLoad({ owner: accountId, profile: loaded });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setProfileLoad({ owner: accountId, error: displayError(failure, expireSession) });
    });
    return () => controller.abort();
  }, [accountId, profileVersion, expireSession]);

  function renderPage() {
    if (visiblePage === 'home') return <Home key={accountId ?? 'guest'} session={session} profile={profile} onExpired={expireSession}
      onNavigate={navigate} onOpenPlant={(plant) => navigate('garden', new URLSearchParams({ plant: plant.id }))} onExploreCrop={exploreCrop} />;
    if (controls && session) {
      if (visiblePage === 'admin') return session.user.role === 'admin'
        ? <AdminPanel key={session.user.id} session={session} onExpired={expireSession} />
        : <section className="empty-state"><h1>Giới hạn truy cập</h1><p className="muted">Trang quản trị dành cho tài khoản Admin.</p><a className="button button-primary" href="#home">Về vườn cây</a></section>;
      if (visiblePage === 'garden') return <Garden key={`${session.user.id}:${route.plantId ?? ''}:${route.adding}`} {...controls}
        initialPlantId={route.plantId} initialAdding={route.adding} onBackToList={() => navigate('garden')} onScanPlant={scanPlant} />;
      if (visiblePage === 'schedule') return <Schedule key={session.user.id} session={session} onExpired={expireSession} />;
      if (visiblePage === 'scan') return <Diagnosis key={`${session.user.id}:${route.plantId ?? ''}:${route.crop ?? ''}`} session={session} onExpired={expireSession} initialPlantId={route.plantId} initialCrop={route.crop} />;
      if (visiblePage === 'chat') return <Chat key={`${session.user.id}:${route.crop ?? ''}`} session={session} onExpired={expireSession} initialCrop={route.crop} />;
      if (visiblePage === 'community') return <Community key={session.user.id} {...controls} onNavigate={navigate} />;
      return <ProfileSettings key={session.user.id} session={session} profile={profile} loadError={currentProfile?.error} logoutError={logoutError}
        loggingOut={loggingOut} onLogout={() => void logout(session)} onExpired={expireSession} onRetry={() => {
          setProfileLoad(undefined);
          setProfileVersion((version) => version + 1);
        }} onSaved={(saved) => setProfileLoad({ owner: session.user.id, profile: saved })} onCredentialsChanged={() => {
          setProfileLoad(undefined);
          setAuth({ status: 'guest', notice: 'Đã cập nhật thông tin đăng nhập. Vui lòng đăng nhập lại.' });
          navigate('login');
        }} />;
    }

    return (
      <div className="auth-screen">
        <section className="auth-content">
          {auth.status === 'guest' && (
            <AuthForm initialNotice={auth.notice} description={privatePageDescriptions[page]} onLogin={(loggedIn) => {
              setAuth({ status: 'authenticated', session: loggedIn });
              if (readRoute().page === 'login') navigate('home');
            }} />
          )}
          {auth.status === 'loading' && <p role="status">Đang kiểm tra phiên đăng nhập…</p>}
          {auth.status === 'error' && (
            <div className="auth-status">
              <h1>Chưa kết nối được</h1>
              <ErrorNotice message={auth.message} />
              <button className="button button-primary" onClick={() => {
                setAuth({ status: 'loading' });
                setCheckVersion((version) => version + 1);
              }}>Thử lại</button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell" data-page={visiblePage} data-auth={session ? 'member' : 'guest'} data-mode={!session && visiblePage !== 'home' ? 'auth' : 'app'}>
      <button type="button" className="skip-link" onClick={() => main.current?.focus()}>Đến nội dung chính</button>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand-link" href="#home" aria-label="PlantCare AI · Trang chủ"><Brand /></a>
          <Navigation page={visiblePage} />
          {session ? (
            <div className="header-account">
              <Notifications key={session.user.id} session={session} onExpired={expireSession} />
              <a className="account-link" href="#profile" aria-label="Hồ sơ cá nhân">
                <AccountAvatar url={profile?.avatarUrl} />
                <span>{profile?.displayName ?? session.user.email}</span>
              </a>
              {session.user.role === 'admin' && <a className="header-admin-link" href="#admin" aria-label="Mở trang quản trị"><ShieldCheck size={21} aria-hidden="true" /></a>}
            </div>
          ) : <a className="button button-primary header-login" href="#login"><LogIn size={17} aria-hidden="true" /> Đăng nhập</a>}
        </div>
      </header>
      <main ref={main} tabIndex={-1} className={visiblePage === 'home' ? 'home-main' : 'main-container'}>{renderPage()}</main>
      <Navigation page={visiblePage} mobile />
    </div>
  );
}

function Navigation({ page, mobile = false }: { page: Page; mobile?: boolean }) {
  return <nav className={mobile ? 'mobile-nav' : 'desktop-nav'} aria-label="Điều hướng chính">
    {navigation.map(({ page: destination, label, icon: Icon }) => (
      <a key={destination} href={`#${destination}`} aria-current={page === destination || (destination === 'home' && page === 'garden') ? 'page' : undefined}>
        <span className="nav-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span><span>{label}</span>
      </a>
    ))}
  </nav>;
}
