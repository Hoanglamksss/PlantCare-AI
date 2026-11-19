import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { careSources, screeningSpecies, type ScreeningSpecies } from '../diagnosis/guidance.js';

type Source = { title: string; url: string };
const input = z.strictObject({ question: z.string().trim().min(2).max(600), speciesCode: z.enum(screeningSpecies).optional() });
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const reply = (text: string, source: Source | null = null, photoSuggested = false) => ({ text, source, photoSuggested });
const cropNames: Record<ScreeningSpecies, RegExp> = {
  tomato: /\b(ca chua|tomato)\b/,
  cucumber: /\b(dua leo|dua chuot|cucumber)\b/,
  chili: /\b(ot|chili)\b/,
  basil: /\b(hung que|hung tay|basil)\b/,
  mint: /\b(bac ha|mint)\b/,
};

const leafReplies: Record<ScreeningSpecies, [string, Source]> = {
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

function answer(words: string, crop?: ScreeningSpecies) {
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
  if (/\b(thoi re|ung re|thoi goc|thoi than|dat uot|dat sung|ung nuoc|tuoi qua nhieu)\b/.test(words)) return reply(
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
  if (/\b(vang la|la vang|heo|benh|sau benh)\b/.test(words)) {
    if (crop === 'basil' || crop === 'cucumber' || crop === 'mint') return reply(...leafReplies[crop], true);
    const plant = crop === 'tomato' ? ' cà chua' : crop === 'chili' ? ' ớt' : '';
    return reply(
      `Vàng lá hoặc héo trên cây${plant} có nhiều nguyên nhân. So sánh lá già và lá mới, tìm chấm nâu hoặc côn trùng dưới lá rồi kiểm tra ẩm sâu hơn mặt đất. Nếu đất khô, tưới chậm vào gốc. Nếu còn sũng, xử lý thoát nước trước. Nếu có vết lan, chụp hai mặt lá để kiểm tra thêm.`,
      crop ? careSources[crop] : careSources.water, true,
    );
  }
  if (/\b(tuoi|tuoi nuoc|am dat|kho dat|dat kho)\b/.test(words)) {
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
  if (crop && /\b(trong|trong chau|chau cay|gian|coc|bon phan|dinh duong|ra hoa|ra qua|thu hoach|cat ngon)\b/.test(words)) {
    return reply(growingReplies[crop], careSources[crop]);
  }
  return reply('Bạn có thể hỏi về cà chua, dưa leo, ớt, húng quế hoặc bạc hà. Cho mình biết dấu hiệu nằm trên lá, thân, quả hay rễ, bắt đầu khi nào và đất đang ẩm hay khô.');
}

export function createChatRouter(requireSession: RequestHandler, requireCsrf: RequestHandler) {
  const router = Router();
  router.post('/chat', requireSession, requireCsrf, (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_QUESTION', 'Nhập câu hỏi từ 2 đến 600 ký tự và chọn loại cây được hỗ trợ.');
    const words = normalize(parsed.data.question);
    const crop = screeningSpecies.find((candidate) => cropNames[candidate].test(words)) ?? parsed.data.speciesCode;
    res.json({ ...answer(words, crop), speciesCode: crop ?? null });
  });
  return router;
}
