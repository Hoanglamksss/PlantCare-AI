import type { ScreeningSpecies } from '../diagnosis/guidance.js';

export function normalize(value: string) {
  return value.normalize('NFD').toLowerCase().replace(/\p{M}/gu, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const crops: Record<ScreeningSpecies, RegExp> = {
  tomato: /\b(ca chua|tomato)\b/,
  cucumber: /\b(dua leo|dua chuot|cucumber)\b/,
  chili: /\b(ot|chili)\b/,
  basil: /\b(hung que|hung tay|basil)\b/,
  mint: /\b(bac ha|mint)\b/,
};

const corrections: ReadonlyArray<[RegExp, string]> = [
  [/\bca (chuaa|chuaaa|chuqa|chuwa)\b/g, 'ca chua'],
  [/\bdua (leoo|leo0|chuoot)\b/g, 'dua leo'],
  [/\bhung (quee|quue)\b/g, 'hung que'],
  [/\bbac (haa|hha)\b/g, 'bac ha'],
  [/\b(tuio|tuow|tuioi|toui)\b/g, 'tuoi'],
  [/\b(vnag|vangg)\b/g, 'vang'],
  [/\b(doom|ddom)\b/g, 'dom'],
  [/\b(bij|bii)\b/g, 'bi'],
  [/\b(bi|lam|benh) (j|z)\b/g, '$1 gi'],
  [/\bkhum\b/g, 'khong'],
];

const followUp = /^(va |con |the |vay |roi |neu |dat van |la van |mat duoi |mat tren |la gia|la non)|\b(cay nay|la nay|anh nay|anh do|luc do)\b/;
const imageQuestion = /\b(anh nay|anh do|anh vua|trong anh|ket qua|sang loc|chan doan)\b/;
const plantWords = /\b(cay|la cay|chau|trong|vuon|tuoi|rep|phan bon|sau an)\b/;
const outside = /\b(giai bai toan|giai phuong trinh|viet code|viet email|bong da|dau tu|tien ao|gia vang|chung khoan)\b/;

export function understandQuestion(question: string) {
  const original = normalize(question);
  const words = corrections.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), original);
  const cropMatches = (Object.keys(crops) as ScreeningSpecies[]).filter((crop) => crops[crop].test(words));
  return {
    words,
    corrected: words !== original,
    crop: cropMatches.length === 1 ? cropMatches[0] : undefined,
    multipleCrops: cropMatches.length > 1,
    followUp: followUp.test(words),
    aboutImage: imageQuestion.test(words) || /^(?:(?:vay|the) )?(?:mai|ngay mai|hom nay|tiep theo|ngay mot|sau (?:48|72) gio) (?:nen |can )?(?:lam gi|xu ly the nao)(?: nua)?$/.test(words),
    outside: outside.test(words) && !plantWords.test(words) && cropMatches.length === 0,
  };
}

export function interpretedQuestion(words: string) {
  return words
    .replace(/\bca chua\b/g, 'cà chua').replace(/\bdua (leo|chuot)\b/g, 'dưa leo')
    .replace(/\bhung que\b/g, 'húng quế').replace(/\bbac ha\b/g, 'bạc hà').replace(/\bot\b/g, 'ớt')
    .replace(/\bla\b/g, 'lá').replace(/\bbi\b/g, 'bị').replace(/\bdom\b/g, 'đốm')
    .replace(/\bvang\b/g, 'vàng').replace(/\btuoi\b/g, 'tưới').replace(/\bnuoc\b/g, 'nước')
    .replace(/\bgi\b/g, 'gì').replace(/\bbenh\b/g, 'bệnh');
}
