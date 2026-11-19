import { ArrowRight, ArrowUpRight, Camera, Leaf, MessageCircle, Sprout, UsersRound } from 'lucide-react';
import { cropLabels, type AccountProfile, type CropCode, type Plant, type Session } from './api';
import type { Page } from './App';
import { HomeDashboard } from './HomeDashboard';
import heroPhoto from './assets/balcony-tomato.jpg';
import comparisonPhoto from './assets/tomato-before-after.jpg';
import cucumberPhoto from './assets/balcony-cucumber.webp';
import herbPhotos from './assets/kitchen-garden.webp';
import indoorPlant from './assets/indoor-monstera.webp';
import './home.css';

interface HomeProps {
  session?: Session;
  profile?: AccountProfile;
  onExpired: () => void;
  onOpenPlant: (plant: Plant) => void;
  onNavigate: (page: Page) => void;
  onExploreCrop: (crop: CropCode) => void;
}

const features = [
  { icon: Camera, page: 'scan', title: 'Quan sát lá qua ảnh', copy: 'Kiểm tra dấu hiệu nhìn thấy trên lá và xem việc có thể làm tại nhà.' },
  { icon: Sprout, page: 'garden', title: 'Nhật ký có ảnh', copy: 'Lưu ngày tháng, ảnh và các lần kiểm tra của từng cây trong cùng hồ sơ.' },
  { icon: MessageCircle, page: 'chat', title: 'Hỏi đáp chăm cây', copy: 'Hỏi từ chuyện tưới nước đến cách kiểm tra lá vàng, mốc trắng và dấu hiệu sâu bệnh.' },
] as const;

const showcase = [
  { code: 'tomato', image: heroPhoto, copy: 'Chùm quả chín đỏ cho ban công nhiều nắng.' },
  { code: 'cucumber', image: cucumberPhoto, copy: 'Một giàn lá xanh mướt ngay bên cửa sổ.' },
  { code: 'chili', image: herbPhotos, panel: 0, copy: 'Quả đỏ nổi bật trên một chậu nhỏ.' },
  { code: 'basil', image: herbPhotos, panel: 1, copy: 'Lá xanh thơm cho góc bếp.' },
  { code: 'mint', image: herbPhotos, panel: 2, copy: 'Một chậu lá mát hương cho ly nước mùa hè.' },
] as const;

export function Home({ session, profile, onExpired, onOpenPlant, onNavigate, onExploreCrop }: HomeProps) {
  const HeroHeading = session ? 'h2' : 'h1';
  return (
    <div className="plant-home" data-member={!!session}>
      {session && <HomeDashboard profile={profile} onExpired={onExpired} onNavigate={onNavigate} onOpenPlant={onOpenPlant} />}
      <section className="plant-hero" aria-labelledby="plant-home-title">
        <div className="plant-hero-copy">
          <p className="plant-home-eyebrow"><Leaf size={17} aria-hidden="true" /> Trồng cây tại nhà</p>
          <HeroHeading id="plant-home-title">Một góc nhà,<br />một vườn xanh.</HeroHeading>
          <p className="plant-hero-description">Từ chậu rau thơm bên cửa sổ đến giàn dưa trên ban công. Chọn cây bạn thích, theo dõi từng lần chăm và kiểm tra lá khi có dấu hiệu lạ.</p>
          <div className="plant-home-actions">
            <button type="button" className="plant-home-primary" onClick={() => onNavigate('scan')}>
              <Camera size={18} aria-hidden="true" /> Kiểm tra ảnh lá
            </button>
            <button type="button" className="plant-home-secondary" onClick={() => onNavigate('garden')}>
              {session ? 'Mở vườn của tôi' : 'Bắt đầu theo dõi cây'} <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
        <img className="plant-hero-photo" src={indoorPlant} width={1122} height={1402} alt="Chậu cây xanh trong góc nhà đón nắng" fetchPriority="high" />
      </section>

      <section className="crop-showcase" aria-labelledby="crop-showcase-title">
        <div className="crop-showcase-heading"><h2 id="crop-showcase-title">Chọn cây cho nhà bạn</h2><p>Khám phá năm loại cây và cách chăm từ ngày đầu.</p></div>
        <div className="crop-showcase-grid">
          {showcase.map((crop) => (
            <button className="crop-showcase-card" key={crop.code} onClick={() => onExploreCrop(crop.code)} type="button">
              <div className={`crop-showcase-image${'panel' in crop ? ` crop-showcase-image-${crop.panel}` : ''}`}>
                <img src={crop.image} alt="" loading="lazy" decoding="async" />
              </div>
              <div className="crop-showcase-copy"><div><h3>{cropLabels[crop.code]}</h3><p>{crop.copy}</p></div><ArrowUpRight size={18} aria-hidden="true" /></div>
              <span className="sr-only">Hỏi cách chăm {cropLabels[crop.code].toLowerCase()}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="plant-home-features" aria-labelledby="plant-features-title">
        <h2 id="plant-features-title">Chăm vườn mỗi ngày</h2>
        <div className="plant-feature-grid">
          {features.map(({ icon: Icon, page, title, copy }) => (
            <button type="button" className="plant-feature" key={page} onClick={() => onNavigate(page)}>
              <span className="plant-feature-icon"><Icon size={23} aria-hidden="true" /></span>
              <span className="plant-feature-title">{title}</span>
              <span className="plant-feature-copy">{copy}</span>
              <ArrowUpRight className="plant-feature-arrow" size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="plant-transformation" aria-labelledby="plant-transformation-title">
        <div>
          <h2 id="plant-transformation-title">Nhìn lại sự thay đổi của cây</h2>
          <p>Chụp lại cùng một góc, ghi ngày và việc đã làm. Mở nhật ký để xem cây thay đổi thế nào theo thời gian.</p>
          <button type="button" className="plant-home-secondary" onClick={() => onNavigate('garden')}>
            Mở nhật ký chăm sóc <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        <figure className="plant-comparison">
          <div className="plant-comparison-frame">
            <img src={comparisonPhoto} width={1774} height={887} loading="lazy" alt="Hai ảnh minh họa cùng một cây cà chua, bên trái lá thưa và ngả vàng, bên phải lá xanh hơn và đã ra quả" />
            <span className="plant-comparison-before">Trước chăm sóc</span>
            <span className="plant-comparison-after">Sau chăm sóc</span>
          </div>
          <figcaption>Hình ảnh trước và sau dùng để minh họa.</figcaption>
        </figure>
      </section>

      <section className="plant-home-community" aria-labelledby="plant-community-title">
        <span className="plant-community-icon"><UsersRound size={26} aria-hidden="true" /></span>
        <div>
          <h2 id="plant-community-title">Ghé vườn cộng đồng</h2>
          <p>Xem những cây được chia sẻ và trao đổi cách chăm với người trồng khác.</p>
        </div>
        <button type="button" className="plant-home-primary" onClick={() => onNavigate('community')}>
          Xem cộng đồng <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
