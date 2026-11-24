import type { Pool } from 'pg';
import { careSources } from '../diagnosis/guidance.js';
import { careAnswer, reply, type Reply } from './care-replies.js';
import { understandQuestion, yellowLeaves } from './language.js';
import { describeActivity, localDate, localDay, readPlantObservation, type ChatPlant } from './plant-context.js';
import { loadLatestPlantScreening } from './screening.js';

const plantingSource = {
  title: 'Oregon State University Extension · Thời gian từ trồng cây con đến thu hoạch',
  url: 'https://extension.oregonstate.edu/es/catalog/em-9032-educators-guide-vegetable-gardening',
};
const harvestDays = { tomato: '60–75', cucumber: '30–46', chili: '72–90' } as const;
const fruitTiming = /\b(bao gio|khi nao|luc nao|chung nao|bao lau|bao nhieu (?:ngay|tuan)|may (?:ngay|tuan)|sap)\b/;
const yields = /\b(ra (?:hoa|trai|qua)|(?:co|dau|hai) (?:trai|qua)|thu hoach|cat la)\b/;
const symptoms = /\b(heo|dom(?: nau| den)?|cham nau|moc (?:trang|xam|suong)|suong mai|phan trang|thoi (?:re|goc)|rep|gi sat|than thu|la (?:xoan|quan|thung)|sau an)\b/;
const hasSymptom = (words: string) => symptoms.test(words) || yellowLeaves.test(words);
export const aboutOwnPlant = (words: string) => /\bcay (?:cua )?(?:toi|minh|tao|t|em|nha toi)\b/.test(words);

function fruitStage(description: string) {
  const words = description.split(fruitTiming, 1)[0] ?? '';
  if (/\b(?:chua|khong) (?:co|ra) hoa\b/.test(words)) return 'beforeFlowers';
  if (/\b(?:chua|khong) (?:co|dau|ra) (?:trai|qua)\b/.test(words) && /\bhoa\b/.test(words)) return 'flowers';
  if (/\b(?:chua|khong) (?:co|dau|ra) (?:trai|qua)\b/.test(words)) return undefined;
  if (/\b(?:da |co )?(?:qua|trai) non\b|\bda (?:dau|co) (?:trai|qua)\b/.test(words)) return 'youngFruit';
  if (/\b(?:da co|co|ra) nu(?: hoa)?\b/.test(words)) return 'buds';
  if (/\b(?:da (?:ra|co)|co) hoa\b|\bhoa (?:roi|cai|duc|no)\b/.test(words)) return 'flowers';
  return undefined;
}

export function plantQuestionKind(words: string, previousWords = '') {
  if (/\bxem ho so cay(?: nay)?\b/.test(words)) return 'overview';
  if ((yields.test(words) && fruitTiming.test(words))
    || ((yields.test(previousWords) && fruitTiming.test(previousWords) || fruitStage(previousWords))
      && (fruitStage(words) || (words.length < 70 && fruitTiming.test(words) && !/\b(tuoi|bon|cat|thay)\b/.test(words))))) return 'fruit';
  if (hasSymptom(previousWords) && understandQuestion(words).followUp && /\b(dat|la gia|la non|mat duoi|uot|kho|am)\b/.test(words)) return 'health';
  if (hasSymptom(words) || /\b(benh (?:gi|khong)|(?:bi|mac) benh|bi (?:gi|sao)|chan doan|dau hieu (?:gi|benh)|trieu chung|xu ly|tri benh)\b/.test(words)) return 'health';
  if (/\b(tinh trang|suc khoe|(?:the nao|sao roi|co on|khoe khong) hom nay|cay (?:cua )?(?:(?:t|toi|tao|em|minh|nay|do) )?(?:hom nay |hien tai |gio )?(?:the nao|sao roi|on khong|khoe khong|co on|co khoe)|(?:hom nay|bay gio|hien tai)\b.{0,28}\b(?:the nao|sao roi|on khong)|^(?:no |nay )?the nao(?: roi)?)\b/.test(words)) return 'status';
  if (/\b((?:can|nen|phai) lam gi|(?:hom nay|mai|tiep theo) lam gi|cham the nao|cach cham|nen theo doi gi)\b/.test(words)) return 'care';
  return undefined;
}

type Observation = Awaited<ReturnType<typeof readPlantObservation>>;
type Scan = Awaited<ReturnType<typeof loadLatestPlantScreening>>;

function journalReply(text: string, source: Reply['source'] = null, photoSuggested = false): Reply {
  return { ...reply(text, source, photoSuggested), origin: 'journal' };
}

function fruitReply(plant: ChatPlant, today: string, words: string, previousWords: string, observation: Observation) {
  const name = `“${plant.nickname}”`;
  const date = plant.plantedOn;
  const days = date && date <= today ? (Date.parse(today) - Date.parse(date)) / 86_400_000 : null;
  const age = days !== null ? `${name} đã được ${days} ngày tính từ ngày trồng trong hồ sơ.`
    : date ? `Ngày trồng trong hồ sơ của ${name} đang ở tương lai.` : `Hồ sơ của ${name} chưa có ngày trồng.`;
  const crop = plant.speciesCode;
  if (crop === 'basil' || crop === 'mint') return journalReply(
    `${age} Nếu mục tiêu là thu lá, có thể hái một ít ngọn khi cây đã có nhiều lá khỏe và ra nhánh. Cắt trên một cặp lá để cây tiếp tục mọc. Cây hiện đã có mấy nhánh khỏe?`,
    careSources[crop],
  );

  const stageGiven = fruitStage(words) ?? fruitStage(previousWords);
  const recordedStage = !stageGiven && observation ? fruitStage(understandQuestion(observation.note).words) : undefined;
  const stage = stageGiven || recordedStage;
  const recorded = recordedStage && observation ? ` Nhật ký ngày ${localDate.format(observation.at)} ghi “${observation.note}”.` : '';
  if (/\b(?:thu hoach|hai (?:qua|trai))\b/.test(words)) {
    const reference = `Mốc tham khảo cho một số giống là ${harvestDays[crop]} ngày từ khi trồng cây con đến lứa thu hoạch. Thời gian còn tùy giống và điều kiện trồng.`;
    const question = stage === 'youngFruit' ? 'Quả lớn cỡ nào rồi, và bạn trồng giống gì?' : 'Bạn bắt đầu bằng hạt hay cây con, và hiện đã thấy quả non chưa?';
    return journalReply(`${age}${recorded} ${reference} ${question}`, plantingSource);
  }
  if (/\bra hoa\b/.test(words) && !/\b(?:qua|trai)\b/.test(words) && fruitTiming.test(words)) {
    return journalReply(`${age}${recorded} Mốc ra hoa còn tùy giống và cây được gieo hạt hay trồng từ cây con. ${stage === 'buds' ? 'Nếu đã có nụ, bạn theo dõi nụ lớn rồi bung cánh.' : 'Ngọn cây hiện đã có nụ hay mới ra lá?'}`, careSources[crop]);
  }
  let next = 'Quả bắt đầu hình thành sau khi hoa đậu. Cây hiện mới ra lá, đã có nụ hay đang nở hoa? Biết giai đoạn này mình mới ước lượng sát hơn.';
  if (stage === 'youngFruit') {
    next = 'Nếu quả non vẫn lớn dần sau khi hoa tàn thì cây đã đậu quả. Bạn có thể so kích thước cùng một quả sau vài ngày.';
  } else if (stage === 'buds' || stage === 'beforeFlowers') {
    next = stage === 'buds' ? 'Cây đang có nụ. Khi nụ nở, theo dõi phần gốc hoa sau lúc cánh tàn để nhận ra quả non.' : 'Cây còn cần ra hoa trước khi đậu quả. Bạn kiểm tra giúp mình ngọn đã có nụ chưa nhé.';
  } else if (stage === 'flowers') {
    next = crop === 'cucumber'
      ? 'Nhìn dưới cánh hoa để tìm hoa cái có phần phình như quả dưa nhỏ. Sau khi hoa tàn, phần đó lớn dần là dấu hiệu đã đậu quả. Bạn có thấy hoa cái chưa?'
      : 'Khi hoa tàn, nhìn ở gốc hoa xem phần quả non có phình lên không. Bạn có thể đánh dấu một chùm đang nở để theo dõi trong vài ngày tới.';
  }
  return journalReply(`${age}${recorded} ${next}`, careSources[crop]);
}

function healthReply(plant: ChatPlant, words: string, previousWords: string, observation: Observation, scan: Scan) {
  const current = hasSymptom(words) ? careAnswer(words, plant.speciesCode) : undefined;
  if (current) return journalReply(`Với “${plant.nickname}”, dựa trên điều bạn vừa mô tả: ${current.text}`, current.source, current.photoSuggested);
  const previous = hasSymptom(previousWords) ? careAnswer(`${words} ${previousWords}`, plant.speciesCode) : undefined;
  if (previous) return journalReply(`Nếu dấu hiệu bạn vừa kể vẫn còn trên “${plant.nickname}”: ${previous.text}`, previous.source, previous.photoSuggested);

  const observedWords = observation ? understandQuestion(observation.note).words : '';
  const fromNote = hasSymptom(observedWords) ? careAnswer(observedWords, plant.speciesCode) : undefined;
  if (observation && fromNote && (!scan || observation.at >= scan.uploadedAt)) {
    return journalReply(`Nhật ký của “${plant.nickname}” ngày ${localDate.format(observation.at)} ghi “${observation.note}”. Nếu dấu hiệu còn thấy hôm nay: ${fromNote.text}`, fromNote.source, fromNote.photoSuggested);
  }
  if (scan?.guidance) {
    const causes = scan.guidance.possibleCauses.map(({ label }) => label.toLowerCase()).slice(0, 2);
    const possibilities = causes.length ? ` Nếu dấu hiệu vẫn còn, hãy đối chiếu với ${causes.join(' hoặc ')}.` : '';
    const followUp = causes.length ? 'Hôm nay vết có lan sang lá mới không?' : 'Hôm nay bạn thấy dấu hiệu gì khác trên cây?';
    return journalReply(`Theo ảnh của “${plant.nickname}” gửi ngày ${localDate.format(scan.uploadedAt)}, ${scan.guidance.recommendation.charAt(0).toLowerCase()}${scan.guidance.recommendation.slice(1)}${possibilities} ${scan.guidance.careSteps[0] ?? ''} ${followUp}`, careSources[plant.speciesCode], true);
  }
  if (plantQuestionKind(words) === 'care') {
    const general = careAnswer('cham soc', plant.speciesCode);
    if (general) return journalReply(`Với “${plant.nickname}”, ${describeActivity(plant, localDay.format(new Date()))} ${general.text} Hôm nay lá và đất trong chậu trông thế nào?`.replace(/ +/g, ' '), general.source);
  }
  return journalReply(`Mình chưa thấy ghi chú triệu chứng hoặc ảnh đã sàng lọc của “${plant.nickname}”. Bạn thấy dấu hiệu rõ nhất ở lá, thân hay quả? Mô tả một dấu hiệu hoặc gửi ảnh cận để mình giúp kiểm tra tiếp.`, null, true);
}

export async function answerAboutPlant(pool: Pool, owner: string, plant: ChatPlant, question: string, previousWords: string) {
  const parts = question.split(/[?\n]+/).map(part => understandQuestion(part)).filter(part => part.words);
  const questions = parts.map(({ words }) => ({ words, kind: plantQuestionKind(words, previousWords) }));
  if (!questions.some(({ kind }) => kind)) return undefined;

  const today = localDay.format(new Date());
  const onlyFruit = questions.every(({ kind }) => kind === 'fruit' || !kind);
  const [observation, scan] = await Promise.all([
    readPlantObservation(pool, owner, plant.id),
    onlyFruit ? null : loadLatestPlantScreening(pool, owner, plant.id),
  ]);
  const answers = questions.flatMap(({ words, kind }) => {
    if (kind === 'fruit') return [fruitReply(plant, today, words, previousWords, observation)];
    if (kind === 'health' || kind === 'care') return [healthReply(plant, words, previousWords, observation, scan)];
    if (!kind) {
      const answer = careAnswer(words, plant.speciesCode);
      return answer ? [answer] : [];
    }

    const activity = describeActivity(plant, today);
    const note = observation ? `Nhật ký ngày ${localDate.format(observation.at)} ghi “${observation.note}”.` : '';
    const result = scan?.guidance ? `Ảnh gửi ngày ${localDate.format(scan.uploadedAt)}: ${scan.guidance.recommendation}` : '';
    const hasToday = [observation?.at, scan?.uploadedAt].some(at => at && localDay.format(at) === today);
    const current = hasToday ? 'Bạn thấy cây thay đổi gì kể từ lần ghi nhận đó?'
      : 'Mình chưa có ghi nhận sức khỏe hôm nay. Bạn thấy lá, ngọn hoặc quả có gì khác lần trước không?';
    const summary = kind === 'overview' ? `Mình đã mở hồ sơ “${plant.nickname}”.` : `Mình xem nhật ký của “${plant.nickname}” nhé.`;
    return [journalReply([summary, activity, note, result, current].filter(Boolean).join(' '), null, !hasToday)];
  });

  const source = answers.find(answer => answer.source)?.source ?? null;
  return journalReply([...new Set(answers.map(answer => answer.text))].join('\n\n'), source, answers.some(answer => answer.photoSuggested));
}
