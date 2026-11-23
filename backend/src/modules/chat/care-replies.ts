import { careSources, type ScreeningSpecies } from '../diagnosis/guidance.js';
import type { CareSource } from './knowledge.js';
import { understandQuestion, yellowLeaves } from './language.js';

export type Reply = {
  text: string;
  source: CareSource | null;
  photoSuggested: boolean;
  interpretation?: string;
  origin?: 'model' | 'guide' | 'journal';
};

export const reply = (text: string, source: CareSource | null = null, photoSuggested = false): Reply => ({ text, source, photoSuggested });
export const scopeReply = () => reply('Chuyện đó nằm ngoài phần mình hỗ trợ. Mình có thể giúp bạn chăm cây, đọc nhật ký cây hoặc tìm cách dùng PlantCare.');
const unclearReplies = {
  symbols: 'Mình chưa đọc được câu hỏi từ các ký tự bạn vừa gửi. Bạn có thể mô tả một dấu hiệu trên cây, ví dụ “lá mới bị vàng” hoặc “đất vẫn ướt mà cây héo”.',
  random: 'Mình có thể hỗ trợ bạn chăm cây trồng tại nhà. Hãy thử gõ tên cây và điều bạn thấy, ví dụ “lá ớt có chấm nâu”. Bạn có thể viết không dấu.',
  vague: 'Mình chưa rõ bạn muốn được giúp phần nào. Bạn có thể nói điều đang xảy ra với cây hoặc cho mình biết thao tác đang vướng trong PlantCare.',
} as const;

export function unclearReply(kind: keyof typeof unclearReplies) {
  return reply(unclearReplies[kind]);
}

const names: Record<ScreeningSpecies, string> = {
  tomato: 'cà chua', cucumber: 'dưa leo', chili: 'ớt', basil: 'húng quế', mint: 'bạc hà',
};

const leafReplies: Record<ScreeningSpecies, [string, CareSource]> = {
  tomato: [
    'Tìm vị trí bắt đầu của vết trên cà chua. Đốm nâu có vòng đồng tâm ở lá thấp gợi ý đốm vòng. Chấm nhỏ, nhiều và có viền vàng cũng gặp ở dạng đốm lá khác. Nếu đốm tăng lên trên lá mới, tách chậu khi có thể, tránh làm ướt tán và dọn lá rụng. Chụp cả thân và quả nếu cũng có vết.',
    careSources.tomatoSpots,
  ],
  cucumber: [
    'Đốm nâu méo, đôi khi thủng ở giữa, có thể gặp khi dưa leo bị thán thư. Với vết vàng góc cạnh theo gân, lật lá tìm lớp xám tím của sương mai. Khi vết lan, giữ dây thông thoáng, hướng nước vào đất và tránh thao tác lúc lá ướt. Tách chậu bị nặng nếu có thể.',
    careSources.cucumberAnthracnose,
  ],
  chili: [
    'Kiểm tra lá thấp và quả ớt. Đốm nâu nhỏ kèm đốm sần trên quả là dấu hiệu cần đối chiếu với đốm lá do vi khuẩn. Nếu nhiều lá hoặc quả xuất hiện vết mới, tách chậu, hạn chế nước bắn lên tán và vệ sinh dụng cụ trước khi chuyển sang chậu khác.',
    careSources.bacterialSpots,
  ],
  basil: [
    'Lật lá thấp của húng quế. Mảng vàng theo gân ở mặt trên và lớp tơ xám ở mặt dưới gợi ý sương mai. Nếu lá có lớp xám và vết lan, tách chậu, để tán thoáng, giữ mặt lá khô và tránh lấy cành từ cây đó để giâm.',
    careSources.basilDowny,
  ],
  mint: [
    'Lật lá bạc hà tìm các nốt gồ màu cam nâu, một dấu hiệu gợi ý gỉ sắt. Nếu chỉ vài lá có nốt, tách chậu, bỏ lá bị nặng lúc tán khô và rửa kéo. Nếu chỉ vàng hoặc héo, kiểm tra đất dưới bề mặt và lỗ thoát nước trước khi tăng tưới.',
    careSources.mint,
  ],
};

const growingReplies: Record<ScreeningSpecies, string> = {
  tomato: 'Cà chua cần vị trí nhiều ánh sáng, giá thể thoát nước và cọc hoặc lồng đỡ. Khi cây có quả, kiểm tra ẩm ở vùng rễ thường xuyên hơn để đất không chuyển qua lại giữa khô kiệt và sũng nước.',
  cucumber: 'Dưa leo thân leo cần giàn và khoảng thoáng để dễ quan sát lá. Khi ít đậu trái, xem có hoa cái với phần phình ngay dưới hoa và côn trùng thụ phấn trước khi tăng phân.',
  chili: 'Ớt cần chậu thoát nước, đủ nắng và ẩm tương đối đều. Nếu hoa rụng khi trời quá nóng hoặc sau một đợt khô, theo dõi nhiệt và độ ẩm đất trước khi bón thêm.',
  basil: 'Húng quế hợp với vị trí sáng, chậu có lỗ thoát nước và tán đủ thoáng. Cắt ngọn ngay trên một cặp lá khỏe để cây phân nhánh nếu mục tiêu là thu lá.',
  mint: 'Bạc hà hợp với đất hơi ẩm và thoát nước, có thể chịu bóng nhẹ. Trồng chậu riêng để dễ giữ ẩm và hạn chế thân lan ra các chậu khác.',
};

export function careAnswer(question: string, crop?: ScreeningSpecies) {
  const words = question.replace(/\b(?:khong (?:he )?(?:co |thay |bi )?|(?<!\bca )chua (?:co |thay |bi ))(?:dom(?: nau| den)?|vang la|la vang|heo|moc trang|rep|rung hoa)\b/g, '');
  if (/\b(bon (?:them|(?:loai )?(?:phan|gi|nhieu))|phan bon|thieu dinh duong|dinh duong|npk)\b/.test(words)) return reply(
    'Trước khi bón, kiểm tra đất có sũng hoặc khô kiệt và cây có vừa thay chậu không. Nếu cây khỏe và đã đến kỳ bón, dùng phân phù hợp với cây trồng chậu theo nhãn. Nếu đang xử lý vàng lá, ưu tiên xem lá già hay lá mới bị trước rồi mới cân nhắc bổ sung dinh dưỡng.',
    careSources.water,
  );
  if (/\b(gieo hat|nay mam|u hat|cham cay con|sang chau|doi chau|thay (?:chau|dat|gia the)|gia the|tron dat)\b/.test(words)) {
    const sowing = /\b(gieo hat|nay mam|u hat|cham cay con)\b/.test(words);
    return reply(sowing
      ? 'Dùng giá thể gieo hạt thoát nước, giữ ẩm nhẹ và đặt khay ở nơi đủ sáng khi cây nhú. Nếu hạt không nảy, xem giá thể có bị sũng hoặc khô lâu không. Bạn gieo hạt gì và đã chờ bao lâu?'
      : 'Chọn chậu có lỗ thoát và giá thể tơi. Khi chuyển chậu, giữ bầu rễ nếu có thể, lấp ở độ sâu phù hợp và kiểm tra độ ẩm sau tưới. Nếu cây đang héo nhiều, xem đất và gốc trước khi quyết định sang chậu.', crop ? careSources[crop] : careSources.water);
  }
  if (/\b(rung (?:hoa|bong)|khong (?:ra hoa|dau (?:trai|qua))|it (?:hoa|qua)|thu phan|hoa (?:duc|cai)|ra hoa|ra qua)\b/.test(words)) {
    if (crop === 'cucumber') return reply(
      'Dưa leo có thể ra hoa đực trước. Tìm hoa cái có phần phình dưới cánh hoa. Nếu đã có hoa cái nhưng quả non không lớn, xem cây có được thụ phấn và đất có khô thất thường không.',
      careSources.cucumber,
    );
    return reply(
      'Bạn thấy cây chưa ra hoa, hay đã ra hoa rồi bị rụng? Nếu hoa rụng sau đợt nóng, theo dõi nhiệt và độ ẩm đất trước khi tăng phân. Nếu cây chỉ tốt lá, xem lại ánh sáng và lượng phân đã bón.',
      careSources.heat,
    );
  }
  if (crop === 'tomato' && /\bmoc suong\b/.test(words)) return reply(
    'Vết mốc sương trên cà chua thường bắt đầu như mảng ướt không đều rồi sẫm nâu. Kiểm tra cả cuống, thân và quả, nhất là khi vết xuất hiện nhanh sau thời tiết ẩm mát. Nếu nhiều lá mới cùng có vết, tách chậu khi có thể, giữ tán khô, dọn lá bị nặng và rửa dụng cụ trước khi chạm cây khỏe.',
    careSources.tomatoLateBlight, true,
  );
  if (/\b(suong mai|phan trang|moc trang|lop bot trang|lop trang|moc xam|to xam)\b/.test(words)) {
    if (crop === 'cucumber') return reply(
      'Trên dưa leo, phấn trắng thường có lớp trắng như bột trên một hoặc cả hai mặt lá. Sương mai thường tạo mảng vàng góc cạnh theo gân, kèm lớp xám tím ở mặt dưới khi ẩm. Lật lá buổi sáng để đối chiếu, tạo khoảng thoáng và hạn chế nước bắn lên lá nếu nghi sương mai. Tách chậu khi vết lan sang lá mới.',
      /\bsuong mai\b/.test(words) ? careSources.cucumberDowny : careSources.cucumberPowdery, true,
    );
    if (crop === 'basil') return reply(
      'Ở húng quế, vàng theo gân ở mặt trên kèm lớp tơ xám dưới lá gợi ý sương mai. Nếu chỉ thấy lớp trắng ở mặt trên, chụp thêm mặt dưới và toàn cây để đối chiếu. Khi nhiều lá xuất hiện dấu tương tự, tách chậu và giữ tán thoáng, khô.',
      careSources.basilDowny, true,
    );
    return reply(
      'Hãy cho mình biết loại cây, lớp trắng nằm ở mặt nào của lá và vết có dạng bột, tơ hay mảng ướt. Nếu vết lan nhanh, để riêng chậu khi có thể và vệ sinh dụng cụ trước khi chuyển sang cây khỏe.',
      careSources.gardenDiseases, true,
    );
  }
  if (/\b(thoi re|ung re|thoi goc|thoi than|dat uot|dat van uot|dat con uot|dat sung|ung nuoc|tuoi qua nhieu)\b/.test(words)) return reply(
    'Nếu cây héo khi đất còn ướt, đổ nước đọng ở khay và kiểm tra lỗ thoát trước khi tưới lại. Nếu cây trồng chậu tiếp tục héo, kiểm tra nhẹ phần rễ ở mép bầu. Rễ mềm, sẫm màu có thể bị thối. Khi chỉ một phần nhỏ bị ảnh hưởng và còn rễ chắc, có thể bỏ phần rễ hỏng rồi trồng lại trong chậu sạch và giá thể thoát nước. Để chậu riêng nếu gốc tiếp tục mềm hoặc đen lan.',
    careSources.roots, true,
  );
  if (/\b(rep|bo tri|nhen do|con trung|sau an|la bi lo|la thung|an la|bo an la)\b/.test(words)) return reply(
    'Lật vài lá và soi chồi non. Cụm côn trùng nhỏ, mềm và dịch dính gợi ý rệp. Nếu thấy rệp và chỉ có ít, có thể rửa rệp bằng tia nước vừa phải ở nơi lá khô nhanh. Nếu lá có lỗ nhưng chưa thấy côn trùng, kiểm tra mặt dưới và quanh chậu lúc mát. Có thể nhặt sâu nhìn thấy bằng găng tay. Chụp vết mới và kiểm tra lại sau vài ngày.',
    careSources.aphids, true,
  );
  if (crop === 'cucumber' && /\b(heo ca day|heo ca cay|heo dot ngot|heo vi khuan)\b/.test(words)) return reply(
    'Khi dưa leo héo cả dây, kiểm tra độ ẩm đất và gốc trước. Nếu có đủ ẩm mà dây vẫn héo tới sáng hôm sau, tìm bọ ăn lá và so sánh với dây còn khỏe. Héo vi khuẩn là một khả năng khi dấu hiệu tiến dần dọc dây. Tách chậu héo khi có thể và kiểm tra các dây bên cạnh để phát hiện dấu hiệu mới.',
    careSources.cucumberWilt, true,
  );
  if (/\b(dom|cham nau|vet nau|vet den|gi sat|than thu|moc suong|mat la den|la den)\b/.test(words)) {
    if (crop) return reply(...leafReplies[crop], true);
    return reply(
      'Bạn trồng cây gì và vết có viền vàng, vòng tròn hay mảng ướt không? Chụp cả hai mặt lá và theo dõi lá mới. Nếu vết lan sang chậu bên cạnh, tách cây nghi bệnh và giữ dụng cụ sạch.',
      careSources.gardenDiseases, true,
    );
  }
  if (yellowLeaves.test(words) || /\b(heo|rung la|(?:quan|cuon|xoan) la|la (?:quan|xoan))\b/.test(words)) {
    const plant = crop ? ` trên ${names[crop]}` : '';
    const leaves = /\bla gia\b/.test(words)
      ? 'Nếu dấu hiệu chỉ ở vài lá già, theo dõi lá mới trước khi đổi cách chăm. '
      : /\bla non\b/.test(words)
        ? 'Với lá non, soi mặt dưới và chồi để tìm côn trùng, dịch dính hoặc biến dạng. '
        : 'So sánh lá già và lá mới để xem dấu hiệu bắt đầu ở đâu. ';
    return reply(
      `Dấu hiệu${plant} cần đối chiếu với cách tưới và tình trạng lá. ${leaves}Sờ đất dưới bề mặt để phân biệt khô và sũng. Nếu vết lan sang lá mới, chụp cả hai mặt lá để mình kiểm tra tiếp. Đất hiện khô hay còn ướt?`,
      crop ? careSources[crop] : careSources.water, true,
    );
  }
  if (/\b(tuoi|am dat|kho dat|dat (?:van |con |hoi )?kho)\b/.test(words)) {
    if (/\bdat (?:van |con |hoi )?kho\b/.test(words)) return reply(
      'Nếu đất khô cả dưới bề mặt, tưới chậm vào gốc cho ẩm đều rồi để nước thừa thoát hết. Quan sát xem lá có hồi lại sau khi cây mát hơn không. Nếu cây vẫn héo dù đất đã ẩm, mình sẽ cùng bạn kiểm tra gốc và rễ.',
      careSources.water,
    );
    const context = crop === 'mint' ? ' Bạc hà ưa đất ẩm nhẹ, hãy để nước thừa thoát hết sau khi tưới.'
      : crop === 'basil' ? ' Húng quế trồng chậu nhỏ có thể khô nhanh, hãy kiểm tra đất thường xuyên hơn khi trời nóng.'
        : '';
    return reply(
      `Sờ đất dưới bề mặt trước khi tưới. Nếu đất còn ướt, chờ ráo và kiểm tra khay hứng. Nếu vùng rễ đã khô, tưới chậm vào đất. Điều chỉnh nhịp theo thời tiết, chậu và giá thể.${context}`,
      crop === 'mint' || crop === 'basil' ? careSources[crop] : careSources.water,
    );
  }
  if (/\b(nang|anh sang|bong ram|chay la|chay nang)\b/.test(words)) {
    const light = crop === 'mint' ? 'Bạc hà có thể chịu bóng nhẹ. Khi nắng làm lá mất độ căng và đất khô nhanh, thử giảm nắng gắt buổi chiều.'
      : 'Nếu cây yếu, vươn dài trong chỗ tối, thử tăng ánh sáng từ từ. Khi mới chuyển chậu ra ngoài, cho cây quen dần với nắng để tránh lá cháy.';
    return reply(
      `${light} Nếu vết khô chỉ xuất hiện phía hứng nắng sau khi chuyển chỗ, theo dõi lá mới trước khi đổi lượng nước hoặc phân.`,
      crop ? careSources[crop] : careSources.gardenDiseases,
    );
  }
  if (/\b(cat (?:tia|ngon|canh)|bam ngon|thu hoach|giam canh|nhan giong)\b/.test(words)) {
    if (crop === 'basil' || crop === 'mint') return reply(
      `Với ${names[crop]}, cắt ngọn trên một cặp lá khỏe để giữ lại các mắt có thể ra nhánh. Dùng kéo sạch và chỉ thu một phần tán mỗi lần để cây còn lá quang hợp.`,
      careSources[crop],
    );
    return reply('Bạn muốn thu lá, thu quả hay cắt tỉa để cây gọn hơn? Cho mình biết loại cây và phần bạn định cắt để mình hướng dẫn đúng.', crop ? careSources[crop] : null);
  }
  if (crop && /\b(trong|trong chau|chau cay|gian|coc|cham soc|cach cham)\b/.test(words)) {
    return reply(growingReplies[crop], careSources[crop]);
  }
  return undefined;
}

export function compareCare(words: string, crops: ScreeningSpecies[]) {
  const answers = crops.map(crop => [names[crop], careAnswer(words, crop)] as const);
  if (!answers.every(([, answer]) => answer)) return undefined;
  const first = answers[0]?.[1];
  if (first && answers.every(([, answer]) => answer?.text === first.text)) return first;
  return reply(answers.map(([name, answer]) => `${name[0]!.toUpperCase()}${name.slice(1)}: ${answer!.text}`).join('\n\n'),
    null, answers.some(([, answer]) => answer?.photoSuggested));
}

export function answerSubquestions(question: string, crop?: ScreeningSpecies) {
  const parts = question.split(/[?\n]+/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return undefined;
  const answers = parts.map(part => {
    const intent = understandQuestion(part);
    return intent.outside ? undefined : careAnswer(intent.words, intent.crop ?? crop);
  });
  if (!answers.every((answer): answer is Reply => answer !== undefined)) return undefined;
  const texts = [...new Set(answers.map(answer => answer.text))];
  const source = answers.every(answer => answer.source?.url === answers[0]?.source?.url) ? answers[0]?.source : null;
  return reply(texts.join('\n\n'), source, answers.some(answer => answer.photoSuggested));
}

export function clarifyAnswer(words: string, crop: ScreeningSpecies | undefined, aboutSite: boolean, aboutPlants: boolean) {
  if (aboutSite) return reply('Bạn đang ở mục nào trong PlantCare và muốn làm thao tác gì? Nếu có thông báo lỗi, gửi mình dòng thông báo đó nhé.');
  if (crop && /\b(benh|bi|trieu chung|dau hieu)\b/.test(words)) {
    return reply(`Bạn đang thấy dấu hiệu gì trên ${names[crop]}? Mô tả điều rõ nhất bạn quan sát được, hoặc gửi mình một ảnh cận.`, null, true);
  }
  if (crop) return reply(`Bạn muốn chăm ${names[crop]} ở giai đoạn nào, hay cây đang có một vấn đề cụ thể?`);
  if (aboutPlants) return reply('Bạn đang trồng cây gì? Nói thêm một chi tiết bạn đang băn khoăn để mình chỉ bước phù hợp nhé.');
  return unclearReply('vague');
}

