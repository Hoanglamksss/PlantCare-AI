import { ArrowRight, Camera, ChevronRight, Droplets, Leaf, NotebookPen, Plus, Sprout } from 'lucide-react';
import type { AccountProfile, CareLog, Page as ApiPage, Plant, Scan } from './api';
import type { Page } from './App';
import { activities, cropLabels, isCropCode } from './api';
import { usePage } from './collections';
import { ErrorNotice } from './ui';
import { PlantPhoto } from './PlantPhoto';

const calendar = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const scanStatus = { queued: 'Đang chờ', processing: 'Đang kiểm tra', completed: 'Đã kiểm tra', failed: 'Cần thử lại' };

export function HomeDashboard({ profile, onExpired, onNavigate, onOpenPlant }: {
  profile?: AccountProfile;
  onExpired: () => void;
  onNavigate: (page: Page) => void;
  onOpenPlant: (plant: Plant) => void;
}) {
  const plants = usePage<Plant>('/plants?limit=3', onExpired);
  const scans = usePage<Scan>('/diagnoses?limit=3', onExpired);
  const name = profile?.displayName?.trim().split(/\s+/).at(-1);
  const firstPlant = plants.page?.items[0];
  return <div className="home-dashboard">
    <header className="home-welcome">
      <div><p className="home-date">{calendar.format(new Date())}</p><h1>Chào {name || 'bạn'},</h1><p>Hôm nay cây của bạn thế nào?</p></div>
    </header>
    <div className="home-kindness">
      <div><h2>Một chút chăm sóc,<br />thêm nhiều mầm xanh.</h2>
        <p>{plants.page ? `${plants.page.items.length}${plants.page.nextCursor ? '+' : ''} cây đang theo dõi` : 'Dành một chút thời gian cho khu vườn của bạn.'}</p>
      </div><Leaf size={46} strokeWidth={1.2} aria-hidden="true" />
    </div>
    <section aria-labelledby="home-garden-heading">
      <div className="home-section-heading"><h2 id="home-garden-heading">Vườn cây của tôi</h2>
        <a className="home-icon-button" aria-label="Thêm cây" href="#garden?add=true"><Plus size={24} aria-hidden="true" /></a>
      </div>
      <ErrorNotice message={plants.error} />
      {!plants.page && (plants.error ? <button className="text-button" onClick={plants.reload}>Thử tải cây</button> : <p className="muted" role="status">Đang mở khu vườn…</p>)}
      {plants.page && <DashboardPlants page={plants.page} onOpenPlant={onOpenPlant} />}
      {!!plants.page?.items.length && <button className="home-view-all" onClick={() => onNavigate('garden')}>Xem tất cả cây <ArrowRight size={16} aria-hidden="true" /></button>}
    </section>
    <div className="home-activity-grid">
      {firstPlant && <RecentJournal plant={firstPlant} onExpired={onExpired} onOpen={() => onOpenPlant(firstPlant)} />}
      <section aria-labelledby="home-scans-heading">
        <div className="home-section-heading"><h2 id="home-scans-heading">Lần kiểm tra gần đây</h2><Camera size={21} strokeWidth={1.6} aria-hidden="true" /></div>
        <ErrorNotice message={scans.error} />
        {!scans.page && (scans.error ? <button className="text-button" onClick={scans.reload}>Thử tải lịch sử</button> : <p role="status" className="muted">Đang tải lần kiểm tra…</p>)}
        {scans.page?.items.length === 0 && <div className="home-soft-empty"><Leaf size={23} aria-hidden="true" /><p>Cây có dấu hiệu lạ? Chụp một ảnh lá để bắt đầu quan sát.</p><button className="text-button" onClick={() => onNavigate('scan')}>Kiểm tra ảnh lá <ArrowRight size={15} aria-hidden="true" /></button></div>}
        <div className="home-activity-list">{scans.page?.items.map((scan) => <a href="#scan" key={scan.id} className="home-activity">
          <span className="home-activity-icon"><Leaf size={20} strokeWidth={1.6} aria-hidden="true" /></span>
          <span><strong>{isCropCode(scan.speciesCode) ? cropLabels[scan.speciesCode] : 'Kiểm tra lá'}</strong><small>{shortDate.format(new Date(scan.createdAt))}</small></span>
          <span className="home-scan-status">{scanStatus[scan.status]}</span>
        </a>)}</div>
      </section>
    </div>
    <button className="home-scan-cta" type="button" onClick={() => onNavigate('scan')}><Camera size={21} aria-hidden="true" /> Kiểm tra sức khỏe bằng ảnh <ArrowRight size={19} aria-hidden="true" /></button>
  </div>;
}

function DashboardPlants({ page, onOpenPlant }: {
  page: ApiPage<Plant>; onOpenPlant: (plant: Plant) => void;
}) {
  if (!page.items.length) return <div className="home-soft-empty">
    <Sprout size={27} aria-hidden="true" /><h3>Khu vườn đang chờ bạn</h3><p>Lưu cây đầu tiên, ghi lại từng lần chăm và nhìn cây lớn lên.</p>
    <a className="button button-primary" href="#garden?add=true"><Plus size={17} aria-hidden="true" /> Thêm cây đầu tiên</a>
  </div>;
  return <div className="home-plant-grid">{page.items.map((plant) => <button key={plant.id} className="home-plant-card" onClick={() => onOpenPlant(plant)}>
    <PlantPhoto speciesCode={plant.speciesCode} className="home-plant-photo" />
    <span className="home-plant-copy"><span className="home-plant-label">Đang theo dõi</span><strong>{plant.nickname}</strong><span>{plant.speciesName}</span><span className="home-plant-open">Mở nhật ký <ChevronRight size={15} aria-hidden="true" /></span></span>
  </button>)}</div>;
}

function RecentJournal({ plant, onExpired, onOpen }: { plant: Plant; onExpired: () => void; onOpen: () => void }) {
  const logs = usePage<CareLog>(`/plants/${plant.id}/care-logs?limit=3`, onExpired);
  return <section aria-labelledby="home-journal-heading">
    <div className="home-section-heading"><h2 id="home-journal-heading">Nhật ký gần đây</h2><NotebookPen size={21} strokeWidth={1.6} aria-hidden="true" /></div>
    <p className="home-journal-plant">{plant.nickname}</p>
    <ErrorNotice message={logs.error} />
    {!logs.page && (logs.error ? <button className="text-button" onClick={logs.reload}>Thử tải nhật ký</button> : <p className="muted" role="status">Đang tải nhật ký…</p>)}
    {logs.page?.items.length === 0 && <div className="home-soft-empty"><p>Ghi lại lần tưới nước hoặc quan sát đầu tiên của cây.</p><button className="text-button" onClick={onOpen}>Viết ghi chú <ArrowRight size={15} aria-hidden="true" /></button></div>}
    <div className="home-activity-list">{logs.page?.items.map((log) => <button key={log.id} className="home-activity" onClick={onOpen}>
      <span className="home-activity-icon" data-water={log.activity === 'watering'}>{log.activity === 'watering' ? <Droplets size={20} aria-hidden="true" /> : <Leaf size={20} aria-hidden="true" />}</span>
      <span><strong>{log.isJournalNote ? 'Ghi chép' : activities[log.activity]}</strong><small>{shortDate.format(new Date(log.happenedAt))}</small></span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>)}</div>
  </section>;
}
