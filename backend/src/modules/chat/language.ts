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
  [/\b(ca?chua|c chua|ca (chu|chuaa|chuaaa|chuqa|chuwa))\b/g, 'ca chua'],
  [/\b(dualeo|duachuot|dua (le|leoo|leo0|chuoot))\b/g, 'dua leo'],
  [/\b(hungque|hung (qe|quee|quue))\b/g, 'hung que'],
  [/\b(bacha|bac (haa|hha))\b/g, 'bac ha'],
  [/\b(tuio|tuow|tuioi|toui|tuooi|tuoii|tuo)\b/g, 'tuoi'],
  [/\b(vnag|vangg|vagn)\b/g, 'vang'],
  [/\b(doom|ddom)\b/g, 'dom'],
  [/\b(heoo|heuu)\b/g, 'heo'],
  [/\b(bij|bii)\b/g, 'bi'],
  [/\b(bi|lam|benh|bon) (j|z)\b/g, '$1 gi'],
  [/\b(k|ko|k0|hok|hong|hem|khum)\b/g, 'khong'],
  [/\b(dc|duocj)\b/g, 'duoc'],
  [/\b(bn|bnh|bnhieu)\b/g, 'bao nhieu'],
  [/\bntn\b/g, 'the nao'],
  [/\b(tks|thks|thanks)\b/g, 'cam on'],
];

const followUp = /^(va |con |the |vay |roi |neu |(?:o |chi )?(?:la gia|la non|mat duoi|mat tren)\b|(?:dat )?(?:van |con )?(?:am|uot|kho)$|dat (?:van |con |hoi )?(?:kho|uot|am)\b|(?:moi |duoc )?\d+ (?:hom|ngay|tuan)\b|khong (?:co|thay|bi|ro)\b|(?:moi ngay )?(?:may lan|bao nhieu lan)\b)|\b(cay nay|cay do|la nay|vet do|anh nay|anh do|luc do|bi nhu vay|may lan nua)\b/;
const shortCareQuestion = /^(?:(?:nen|can|co nen|co can) )?(?:tuoi (?:may lan|bao nhieu|the nao|khi nao|them)|bon (?:gi|them|phan gi)|cat (?:tia|ngon))(?: khong| nua| moi ngay| mot ngay)?$|^khi nao tuoi$/;
const imageQuestion = /\b(anh nay|anh do|anh vua|trong anh|ket qua (?:anh|nay|do|sang loc)|lan sang loc)\b/;
const timeQuestion = /^(?:(?:vay|the) )?(?:mai|ngay mai|hom nay|tiep theo|ngay mot|sau (?:48|72) gio) (?:nen |can )?(?:lam gi|xu ly the nao)(?: nua)?$/;
export const yellowLeaves = /\b(vang la|la(?: [a-z]+){0,4} vang)\b/;
const plantWords = /\b(cay|chau|trong|vuon|tuoi|dat (?:kho|am|uot)|rep|phan bon|bon (?:phan|them|gi)|gia the|thu hoach|nay mam|ra hoa|dau qua|rung hoa|heo|vang la|la vang|dom nau|moc trang|xu ly sau|sau an|sang loc|chan doan|cat tia|giam canh)\b/;
const siteWords = /\b(plantcare|ung dung|trang web|web nay|dang nhap|dang ky|otp|xac minh email|doi mat khau|cong dong|nhat ky|thong bao)\b/;
const outside = /\b(giai (?:bai (?:toan|tap)|phuong trinh|toan)|tinh dao ham|viet (?:code|ma nguon|email|bai van|truyen|rap)|lap trinh|giai thuat|cay nhi phan|bong da|ty so tran|dau tu|tien ao|bitcoin|gia vang|chung khoan|crypto|cong thuc nau|nau mon|cach nau|(?:tre em|con toi|con minh) bi (?:sot|ho)|dieu tri (?:nguoi|benh nhan)|bo qua (?:chi dan|huong dan|quy tac)|(?:tiet lo|in ra) (?:system prompt|chi dan he thong))\b/;

export function understandQuestion(question: string) {
  const original = normalize(question);
  const words = corrections.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), original);
  const cropMatches = (Object.keys(crops) as ScreeningSpecies[]).filter((crop) => crops[crop].test(words));
  return {
    words,
    crop: cropMatches.length === 1 ? cropMatches[0] : undefined,
    crops: cropMatches,
    followUp: followUp.test(words) || shortCareQuestion.test(words) || timeQuestion.test(words),
    aboutImage: imageQuestion.test(words),
    timeQuestion: timeQuestion.test(words),
    aboutPlants: cropMatches.length > 0 || plantWords.test(words) || yellowLeaves.test(words),
    aboutSite: siteWords.test(words),
    outside: outside.test(words),
  };
}

export function greetingAnswer(words: string) {
  if (/^(alo|chao|chao ban|xin chao|hello|hi|hey)( (a|nha|nhe|ban oi))?$/.test(words)) {
    return 'Chào bạn! Hôm nay mình giúp bạn chăm cây hay tìm một tính năng trong PlantCare?';
  }
  if (/^cam on(?: ban| nhieu| nhieu lam)?(?: a| nha| nhe)?$/.test(words)) {
    return 'Không có gì! Nếu cây có dấu hiệu mới, cứ nhắn mình xem cùng nhé.';
  }
  if (/^(ok|oke|okey|duoc roi|minh hieu roi|da hieu|ro roi)( (a|nha|nhe))?$/.test(words)) {
    return 'Ừ, bạn cứ thử bước đó rồi báo mình nếu cần xem tiếp nhé.';
  }
  return null;
}

// Keep short Vietnamese replies such as “ớt”, “ẩm” and “3 hôm” usable in context.
export function unclearInput(question: string, intent: ReturnType<typeof understandQuestion>) {
  if (!/\p{L}/u.test(question)) return 'symbols';
  if (/^(help|test|thu|uh|um|hm|gi|sao|giup (minh|toi|em|voi)|ban oi|bot oi|khong biet|khong ro)$/.test(intent.words)) return 'vague';
  if (intent.aboutPlants || intent.aboutSite || intent.aboutImage || intent.followUp || intent.outside) return null;
  if (!intent.words) return null;
  const tokens = intent.words.split(' ');
  const looksRandom = (token: string) => /^(?:asdf|qwer|zxcv|hjkl|abc|xyz)[a-z0-9]*$/.test(token)
    || /^[a-z]*([a-z])\1{3,}[a-z]*$/.test(token)
    || /^[b-df-hj-np-tv-z0-9]{3,}$/.test(token);
  if (tokens.every(looksRandom)) return 'random';
  return null;
}
