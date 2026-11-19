import { Leaf } from 'lucide-react';
import { cropLabels, isCropCode } from './api';
import tomato from './assets/balcony-tomato.jpg';
import cucumber from './assets/balcony-cucumber.webp';
import herbs from './assets/kitchen-garden.webp';
import './plant-photo.css';

const photos = {
  tomato: { source: tomato },
  cucumber: { source: cucumber },
  chili: { source: herbs, panel: 0 },
  basil: { source: herbs, panel: 1 },
  mint: { source: herbs, panel: 2 },
} as const;

export function PlantPhoto({ speciesCode, className = '' }: { speciesCode: string; className?: string }) {
  const crop = isCropCode(speciesCode) ? speciesCode : null;
  const photo = crop ? photos[crop] : null;
  return <span className={`plant-photo ${className}`} data-panel={photo && 'panel' in photo ? photo.panel : undefined}>
    {photo && crop ? <img src={photo.source} alt={`Ảnh minh họa cây ${cropLabels[crop].toLowerCase()}`} loading="lazy" decoding="async" /> : <Leaf size={32} aria-hidden="true" />}
  </span>;
}
