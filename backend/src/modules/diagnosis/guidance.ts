export const screeningSpecies = ['tomato', 'cucumber', 'chili', 'basil', 'mint'] as const;
export type ScreeningSpecies = (typeof screeningSpecies)[number];

const umn = 'https://extension.umn.edu';
const garden = `${umn}/garden-and-home/yard-and-garden`;
const diseases = `${umn}/agriculture/specialty-crops/vegetable-farming/disease-management`;

export const careSources = {
  tomato: { title: 'UMN Extension · Trồng cà chua', url: `${garden}/gardening-in-minnesota/growing-tomatoes` },
  cucumber: { title: 'UMN Extension · Trồng dưa leo', url: `${garden}/gardening-in-minnesota/growing-cucumbers` },
  chili: { title: 'UMN Extension · Trồng ớt', url: `${garden}/gardening-in-minnesota/growing-peppers` },
  basil: { title: 'UMN Extension · Trồng húng quế', url: `${garden}/yard-and-garden-problems/growing-basil` },
  mint: { title: 'USU Extension · Trồng bạc hà và bệnh thường gặp', url: 'https://extension.usu.edu/yardandgarden/research/mint-in-the-garden/' },
  tomatoSpots: { title: 'UMN Extension · Đốm lá cà chua', url: 'https://apps.extension.umn.edu/garden/diagnose/plant/vegetable/tomato/leavesspots.html' },
  tomatoLateBlight: { title: 'UMN Extension · Mốc sương ở cà chua', url: `${diseases}/late-blight` },
  bacterialSpots: { title: 'UMN Extension · Đốm lá do vi khuẩn ở cà chua và ớt', url: `${diseases}/bacterial-spot-of-tomato-and-pepper` },
  cucumberDowny: { title: 'UMN Extension · Sương mai ở dưa leo', url: `${diseases}/downy-mildew-of-cucurbits` },
  cucumberPowdery: { title: 'UMN Extension · Phấn trắng ở cây họ bầu bí', url: `${diseases}/powdery-mildew-of-cucurbits` },
  cucumberAnthracnose: { title: 'UMN Extension · Thán thư ở cây họ bầu bí', url: `${diseases}/anthracnose-of-cucurbits` },
  cucumberWilt: { title: 'UMN Extension · Héo vi khuẩn ở cây họ bầu bí', url: `${diseases}/bacterial-wilt` },
  basilDowny: { title: 'UMN Extension · Sương mai ở húng quế', url: `${diseases}/basil-downy-mildew` },
  water: { title: 'UMN Extension · Tưới cây trồng chậu', url: `${garden}/gardening-in-minnesota/fertilizing-and-watering-container-plants` },
  heat: { title: 'UMN Extension · Ảnh hưởng của nóng lên rau trồng', url: `${garden}/yard-and-garden-problems/how-excessive-heat-affects-the-vegetable-garden` },
  roots: { title: 'University of Maryland Extension · Thối rễ cây trồng chậu', url: 'https://extension.umd.edu/resource/root-rots-indoor-plants' },
  aphids: { title: 'UMN Extension · Rệp trong vườn', url: `${garden}/yard-and-garden-insects/aphids` },
  gardenDiseases: { title: 'UMN Extension · Kiểm soát bệnh cây tại vườn nhà', url: `${garden}/yard-and-garden-problems/managing-plant-diseases-in-the-home-garden` },
};

type Cause = { label: string; detail: string };
type CropCheck = { cause: Cause; step: string; yellowingStep?: string };
const cropChecks: Record<ScreeningSpecies, CropCheck> = {
  tomato: {
    cause: { label: 'Bệnh đốm lá ở cà chua', detail: 'Đốm nâu có vòng đồng tâm trên lá thấp gợi ý đốm vòng. Chấm nhỏ không có vòng cũng gặp ở các bệnh đốm lá khác.' },
    step: 'Kiểm tra lá tầng thấp của cà chua trước. Soi xem vết có vòng đồng tâm, viền vàng hay vết ướt lan sang thân và quả.',
    yellowingStep: 'Xem lá cà chua vàng ở tầng thấp hay lan lên chồi mới. Soi lá sát đất và mặt dưới lá để tìm chấm nâu hoặc côn trùng.',
  },
  cucumber: {
    cause: { label: 'Sương mai hoặc một dạng đốm lá ở dưa leo', detail: 'Mảng vàng góc cạnh theo gân kèm lớp xám tím mặt dưới gợi ý sương mai. Đốm nâu méo, đôi khi thủng ở giữa, có thể gặp ở bệnh thán thư.' },
    step: 'Lật mặt dưới lá dưa leo vào buổi sáng. Phân biệt lớp xám tím dưới mảng vàng theo gân với lớp trắng dạng bột trên mặt lá.',
  },
  chili: {
    cause: { label: 'Đốm lá do vi khuẩn ở ớt', detail: 'Nhiều chấm nâu nhỏ trên lá, nhất là khi có đốm sần ở quả và tán thường ướt, là dấu hiệu nên đối chiếu.' },
    step: 'Soi lá thấp và quả ớt. Nếu nhiều lá có chấm tương tự, tránh chạm tán khi ướt và giữ nước tưới khỏi bắn giữa các chậu.',
    yellowingStep: 'Kiểm tra chồi non của ớt có lá quăn, dịch dính hoặc cụm côn trùng nhỏ bên dưới lá hay không.',
  },
  basil: {
    cause: { label: 'Sương mai ở húng quế', detail: 'Lá thấp vàng thành từng mảng theo gân và có lớp tơ xám ở mặt dưới là tổ hợp dấu hiệu cần kiểm tra.' },
    step: 'Kiểm tra mặt dưới các lá vàng thấp của húng quế. Nếu thấy lớp xám và vết đang lan, tách chậu, giữ lá khô và tránh lấy cành cây đó để giâm.',
  },
  mint: {
    cause: { label: 'Gỉ sắt ở bạc hà', detail: 'Các nốt gồ màu cam hoặc nâu ở mặt dưới lá là dấu hiệu gợi ý gỉ sắt. Mảng nâu phẳng cần kiểm tra thêm.' },
    step: 'Lật lá bạc hà để tìm nốt gồ cam nâu. Nếu chỉ vài lá có nốt, tách chậu, bỏ lá bị nặng khi tán đã khô và rửa kéo sau khi dùng.',
    yellowingStep: 'So sánh mép lá và ngọn mới của bạc hà. Nếu mép vàng kèm quăn hoặc cả nhánh héo dù đất còn ẩm, kiểm tra vùng rễ và theo dõi các nhánh bên cạnh.',
  },
};

const moistureCause: Cause = {
  label: 'Đất khô hoặc đọng nước',
  detail: 'Vàng lá kèm héo có thể liên quan đến độ ẩm ở vùng rễ. Đất sũng và đất khô cần hai cách xử lý khác nhau.',
};
const lightDamage: Cause = {
  label: 'Lá bị tổn thương do môi trường',
  detail: 'Nếu vết khô nằm ở vùng lá lộ nắng và xuất hiện sau khi chuyển chỗ hoặc bị cọ xát, hãy theo dõi vị trí đó so với lá mới.',
};
const checkMoisture = 'Sờ đất dưới bề mặt trước khi tưới. Nếu đất khô, tưới chậm vào gốc. Nếu còn sũng, để thoát nước, đổ khay hứng và chờ đất ráo.';
const monitorSpread = 'Chụp lại cùng góc sau 1–2 ngày. Nếu vết xuất hiện trên nhiều lá mới, tách chậu nghi bệnh khỏi chậu khỏe và vệ sinh dụng cụ sau khi chạm cây.';

export function isScreeningSpecies(value: string): value is ScreeningSpecies {
  return Object.prototype.hasOwnProperty.call(cropChecks, value);
}

export function screeningGuidance(speciesCode: string, outcome: string | null, findings: readonly { code: string }[]) {
  const yellowing = findings.some(({ code }) => code === 'yellowing');
  const spotting = findings.some(({ code }) => code === 'dark_spots');
  if (!yellowing && !spotting) {
    if (outcome === 'healthy') {
      return {
        recommendation: 'Chưa thấy vùng vàng hoặc chấm nâu rõ trong vùng lá nhìn được.',
        possibleCauses: [],
        careSteps: ['Theo dõi lá mới và chụp thêm mặt dưới nếu thấy vết lạ.'],
      };
    }
    return {
      recommendation: 'Ảnh hiện chưa đủ thông tin để khoanh vùng nguyên nhân.',
      possibleCauses: [],
      careSteps: [
        'Chụp cận một lá có dấu hiệu, dùng ánh sáng tán xạ và để lá chiếm phần lớn khung hình.',
        'Chụp thêm mặt dưới và một lá ít bị ảnh hưởng để so sánh.',
      ],
    };
  }

  const crop = isScreeningSpecies(speciesCode) ? cropChecks[speciesCode] : undefined;
  const includeCropCause = spotting || speciesCode === 'basil' || speciesCode === 'cucumber';
  return {
    recommendation: 'Ảnh có dấu hiệu cần quan sát thêm. Dùng các đặc điểm dưới đây để đối chiếu trước khi xử lý.',
    possibleCauses: [...(crop && includeCropCause ? [crop.cause] : []), ...(yellowing ? [moistureCause] : []), ...(spotting ? [lightDamage] : [])],
    careSteps: [
      (includeCropCause ? crop?.step : crop?.yellowingStep)
        ?? 'So sánh lá già và lá mới. Lật mặt dưới lá để kiểm tra đốm, côn trùng hoặc tơ mảnh.',
      ...(yellowing ? [checkMoisture] : ['Nếu tán thường ướt, tăng khoảng thoáng giữa cây và hướng nước tưới vào đất khi cần.']),
      monitorSpread,
    ],
  };
}
