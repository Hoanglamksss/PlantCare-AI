import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const quote = (text) => JSON.stringify(text);
const html = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const snapshot = JSON.parse(await fs.readFile(path.join(directory, 'schema-snapshot.json'), 'utf8'));
const tables = new Map(snapshot.tables.map(table => [table.name, table.columns]));
const shortType = value => value.replace('timestamp with time zone', 'timestamptz').replace('time without time zone', 'time');

function tableNode(name) {
  const rows = tables.get(name).map(column => {
    const key = [column.primary && 'PK', column.foreign && 'FK', !column.primary && column.unique && (column.uniqueSingle ? 'UQ' : 'UQ*'), column.identity && 'IDENTITY',
      column.generated && 'GENERATED', column.nullable && '?'].filter(Boolean).join(', ');
    return `<TR><TD ALIGN="LEFT">${html(column.name)}</TD><TD ALIGN="LEFT">${html(shortType(column.type))}</TD><TD ALIGN="LEFT">${key}</TD></TR>`;
  }).join('\n');
  return `${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6"><TR><TD COLSPAN="3" BORDER="1"><FONT POINT-SIZE="15"><B>${name}</B></FONT></TD></TR>${rows}</TABLE>>];`;
}

function erd(filename, title, names, note) {
  const grouped = new Map();
  for (const edge of snapshot.relationships) {
    if (!names.includes(edge.parent) || !names.includes(edge.child)) continue;
    const key = `${edge.parent}:${edge.child}`;
    const previous = grouped.get(key);
    grouped.set(key, { ...edge, optional: edge.optional && (previous?.optional ?? true), unique: edge.unique || previous?.unique });
  }
  const edges = [...grouped.values()].map(edge => {
    const max = edge.unique ? '1' : edge.child.endsWith('_photos') ? '4' : 'N';
    return `${edge.parent} -> ${edge.child} [label=${quote(`${edge.optional ? '0..1' : '1'} : 0..${max}`)}];`;
  });
  const legend = `PK = khóa chính · FK = khóa ngoại · UQ = duy nhất · UQ* = tham gia khóa duy nhất ghép · ? = được rỗng\nKhóa ghép được gom thành quan hệ giữa bảng. Mũi tên từ bảng được tham chiếu tới bảng giữ FK.\nCardinality thể hiện khả năng schema; API tạo chẩn đoán và job cùng giao dịch.\n${note}`;
  return fs.writeFile(path.join(directory, `${filename}.dot`), `digraph ERD {
    graph [rankdir=LR, bgcolor="white", pad=0.5, nodesep=0.65, ranksep=1.5, splines=polyline,
      fontname="Arial", fontsize=25, labelloc=t, label=${quote(title)}];
    node [shape=plain, fontname="Arial", fontsize=12, fontcolor="black"];
    edge [dir=forward, arrowhead=normal, arrowsize=0.65, color="black", fontname="Arial", fontsize=12];
    ${names.map(tableNode).join('\n')}
    ${edges.join('\n')}
    legend [shape=plaintext, fontsize=14, label=${quote(legend)}];
  }\n`);
}

await erd('06-erd-hien-tai', `PlantCare AI 0.5 — ERD PostgreSQL hiện tại\n${tables.size} bảng gồm schema_migrations · migration 0001–0011`,
  [...tables.keys()], 'Ảnh nằm trong MinIO/R2 riêng tư. Metadata được đọc từ DB local.\nBảng cộng đồng cũ giữ tương thích. Chi tiết CHECK / UNIQUE và trigger nằm trong SQL migration.');

await erd('07-erd-cong-dong-hien-tai', 'PlantCare AI 0.5 — ERD cộng đồng\nNhiều bài trên một cây, trả lời, cảm xúc và ảnh', [
  'accounts', 'user_plants', 'images', 'community_plant_posts', 'community_posts', 'community_post_comments',
  'community_post_reactions', 'community_comment_likes', 'community_post_photos', 'community_comment_photos',
], 'an_luc ghi thời điểm ẩn kiểm duyệt. Sửa bài của chủ giữ trạng thái kiểm duyệt hiện tại.\nparent_id cùng post_id giữ bình luận cha trong đúng bài. Mỗi bài/bình luận tối đa 4 ảnh và cùng chủ.\ncommunity_plant_posts giữ quyền chia sẻ cây/lịch sử; mỗi cây có nhiều community_posts.');

await erd('09-erd-lich-thong-bao', 'PlantCare AI 0.5 — ERD lịch chăm sóc và thông báo\nDữ liệu máy chủ thuộc từng tài khoản', [
  'accounts', 'user_plants', 'care_schedules', 'notifications', 'sessions', 'admin_audit_logs',
], 'client_id duy nhất theo tài khoản giúp nhập lịch trình duyệt an toàn.\nUNIQUE (lich_id, hen_luc) chống trùng. Xóa lịch dừng nhắc mới, giữ lịch sử thông báo.\nWorker chỉ nhắc tài khoản hoạt động và cây chưa lưu trữ. Múi giờ Asia/Ho_Chi_Minh (UTC+7).');

// Graphviz neato with pinned nodes gives deterministic sequence layout.
// Every message has its own row, with a full-width lane for annotations.
function sequence(name, title, participants, messages, note) {
  const column = 4.8;
  const yStep = 1.25;
  const span = (participants.length - 1) * column;
  const nodes = [];
  const edges = [];
  for (const [index, participant] of participants.entries()) {
    const [label, color, fill] = participant;
    nodes.push(`h${index} [pos="${index * column},0!", label=${quote(label)}, shape=box, style="rounded,filled", color=${quote(color)}, fillcolor=${quote(fill)}, width=3.65, height=0.7, fontsize=17, penwidth=1.5];`);
  }
  for (let row = 0; row <= messages.length; row += 1) {
    for (let participant = 0; participant < participants.length; participant += 1) {
      nodes.push(`p${row}_${participant} [pos="${participant * column},${-(row + 0.7) * yStep}!", shape=point, width=0.01, label="", style=invis];`);
      const start = row === 0 ? `h${participant}` : `p${row - 1}_${participant}`;
      edges.push(`${start} -> p${row}_${participant} [style=dashed, color="#b1b9bf", arrowhead=none, penwidth=1];`);
    }
  }
  for (const [row, message] of messages.entries()) {
    const [from, to, label, kind = 'request'] = message;
    const color = kind === 'response' ? '#207054' : kind === 'error' ? '#a1413a' : '#285e93';
    edges.push(`p${row}_${from} -> p${row}_${to} [label=${quote(`${row + 1}. ${label}`)}, color=${quote(color)}, fontcolor=${quote(color)}, fontsize=15, penwidth=1.5, ${kind === 'response' ? 'style=dashed,' : ''} arrowsize=0.85];`);
  }
  nodes.push(`title [pos="${span / 2},1.3!", shape=plaintext, fontsize=25, label=${quote(title)}];`);
  nodes.push(`note [pos="${span / 2},${-(messages.length + 1.5) * yStep}!", shape=plaintext, fontsize=15, label=${quote(note)}];`);
  return fs.writeFile(path.join(directory, `${name}.dot`), `// engine: neato\ndigraph Sequence {\n  graph [bgcolor="white", overlap=true, splines=line, pad=0.45];\n  node [fontname="Arial", pin=true];\n  edge [fontname="Arial"];\n  ${nodes.join('\n')}\n  ${edges.join('\n')}\n}\n`, 'utf8');
}

const user = ['User / React', '#24734c', '#e8f5ef'];
const api = ['Node.js API', '#3979a8', '#eaf3fb'];
const db = ['PostgreSQL', '#6d5c9b', '#f0ebf8'];
const media = ['Media / MinIO', '#a37627', '#fff3dc'];
const inference = ['Python ảnh', '#43609b', '#edf1fa'];
const worker = ['Node worker', '#43609b', '#edf1fa'];

await sequence('03-sequence-kiem-tra-anh', 'PlantCare AI 0.5 — Sàng lọc ảnh và lưu kết quả', [user, api, db, media, worker, inference], [
  [0, 1, 'POST /api/v1/diagnoses\nẢnh, loài, cây nếu có, Idempotency-Key'],
  [1, 2, 'Kiểm tra phiên, chủ cây, loài\nvà khóa chống gửi trùng'],
  [1, 5, 'Chuẩn hóa ảnh và bỏ EXIF'],
  [5, 1, 'Ảnh JPEG đã chuẩn hóa', 'response'],
  [1, 2, 'Tạo reservation ảnh pending_delete\nThời hạn 2 phút'],
  [1, 3, 'Lưu ảnh vào bucket riêng tư'],
  [1, 2, 'Giao dịch kích hoạt ảnh ready\nTạo chẩn đoán và công việc nền'],
  [1, 0, '202 và mã chẩn đoán', 'response'],
  [4, 2, 'Nhận job bằng giao dịch\nKhóa hàng đợi, cấp lease 45 giây'],
  [4, 3, 'Đọc ảnh đã lưu'],
  [3, 4, 'Dữ liệu ảnh', 'response'],
  [4, 5, 'Phân tích dấu hiệu trong ảnh'],
  [5, 4, 'Dấu hiệu nhìn thấy và kết quả', 'response'],
  [4, 2, 'Lưu kết quả, kết thúc công việc\nKiểm tra token lease'],
  [0, 1, 'GET /diagnoses/{id}\nHỏi trạng thái theo khoảng chờ'],
  [1, 2, 'Đọc kết quả theo chủ tài khoản'],
  [1, 0, 'Trạng thái, dấu hiệu và gợi ý\nchăm sóc theo loài', 'response'],
], 'Phiên, Origin và CSRF được kiểm tra trước thao tác ghi. Nhánh gửi trùng trả lại cùng ID.\nLỗi tạm thời được xử lý theo lease và số lần thử. Bản hiện tại là sàng lọc dấu hiệu, mô hình bệnh đang chờ kiểm định.');

await sequence('04-sequence-nhat-ky-chia-se', 'PlantCare AI 0.5 — Nhật ký ảnh và quyền chia sẻ', [user, api, db, media, inference], [
  [0, 1, 'POST /plants/{id}/notes\nNội dung, thời gian và tối đa 4 ảnh'],
  [1, 2, 'Kiểm tra chủ cây và tài khoản\nCho phép cây đang theo dõi hoặc lưu trữ'],
  [1, 4, 'Chuẩn hóa từng ảnh, bỏ metadata'],
  [4, 1, 'Ảnh JPEG hợp lệ', 'response'],
  [1, 2, 'Tạo reservation ảnh pending_delete\nThời hạn 2 phút'],
  [1, 3, 'Lưu ảnh qua dịch vụ Media\nĐặt thời hạn reservation'],
  [1, 2, 'Một giao dịch kích hoạt ảnh\nvà thêm care_logs + care_log_photos'],
  [1, 0, '201, nhật ký và URL ảnh chính chủ', 'response'],
  [0, 1, 'PUT /plants/{id}/share\nshared=true, title, includeHistory'],
  [1, 2, 'Khóa cây, ghi quyền chia sẻ\nĐồng bộ community_posts bằng trigger'],
  [1, 0, '200, trạng thái quyền chia sẻ', 'response'],
  [0, 1, 'Thu hồi bằng shared=false'],
  [1, 2, 'Đặt da_chia_se=false\nvà chia_se_nhat_ky=false'],
  [1, 0, '200, đã thu hồi chia sẻ', 'response'],
], 'Chia sẻ hồ sơ cây và chia sẻ nhật ký là lựa chọn riêng của chủ cây.\nẢnh gốc vẫn ở bucket riêng tư. API kiểm tra lại quyền khi trả ảnh cho người xem cộng đồng.');

await sequence('05-sequence-cong-dong', 'PlantCare AI 0.5 — Bài đăng, trả lời và cảm xúc', [user, api, db, media, inference], [
  [0, 1, 'POST /community/posts\nCây, tiêu đề, ghi chú, thời gian và ảnh'],
  [1, 2, 'Kiểm tra cây thuộc User\nReserve ảnh mới nếu có'],
  [1, 4, 'Chuẩn hóa ảnh và bỏ EXIF'],
  [4, 1, 'JPEG hợp lệ', 'response'],
  [1, 3, 'Lưu ảnh vào bucket riêng tư'],
  [1, 2, 'Giao dịch thêm bài, liên kết ảnh\nvà quyền chia sẻ theo lựa chọn'],
  [1, 0, '201, bài đăng và URL ảnh', 'response'],
  [0, 1, 'GET /community/posts\nhoặc /community/posts/{id}'],
  [1, 2, 'Lọc quyền chia sẻ, chủ hoạt động\nvà bài chưa bị ẩn kiểm duyệt'],
  [1, 0, 'Bài, ảnh, cảm xúc và số bình luận', 'response'],
  [0, 1, 'POST /community/posts/{id}/comments\nNội dung, parentId và ảnh tùy chọn'],
  [1, 2, 'Kiểm tra cha cùng bài, quyền xem\nThêm bình luận và liên kết ảnh'],
  [1, 0, '201, bình luận hoặc trả lời', 'response'],
  [0, 1, 'PUT /community/posts/{id}/reaction\nhoặc /comments/{commentId}/like'],
  [1, 2, 'UPSERT phản ứng của chính User'],
  [1, 0, 'Phản ứng và số lượng mới', 'response'],
], 'Mỗi cây có nhiều bài, mỗi bài và bình luận tối đa 4 ảnh. Đọc cộng đồng cần đăng nhập.\nẢnh đi qua API với private, no-store và kiểm tra lại quyền. Sửa nội dung giữ trạng thái kiểm duyệt.');

await sequence('10-sequence-lich-thong-bao', 'PlantCare AI 0.5 — Lịch máy chủ và thông báo', [user, api, db, worker], [
  [0, 1, 'POST /schedules\nCây, công việc, ngày giờ và chu kỳ'],
  [1, 2, 'Khóa giao dịch, kiểm tra chủ cây\nvà tài khoản đang hoạt động'],
  [1, 2, 'Ghi rule và lần đến hạn tiếp\nclientId chống nhập trùng lịch cũ'],
  [1, 0, '201, lịch và nextRunAt UTC+7', 'response'],
  [3, 2, 'Tick 10 giây, try advisory lock\nLấy tối đa 50 lịch đến hạn'],
  [3, 2, 'Khóa lịch, kiểm tra lại tài khoản\nvà cây chưa lưu trữ'],
  [3, 2, 'Một giao dịch thêm notifications\nvà tính lần đến hạn tiếp theo'],
  [2, 3, 'Commit, UNIQUE (lịch, giờ hẹn)\ngiữ thông báo không trùng', 'response'],
  [0, 1, 'GET /notifications\nKhi mở chuông hoặc polling'],
  [1, 2, 'Đọc thông báo của chủ\nvà đếm số chưa đọc'],
  [1, 0, 'Danh sách và unreadCount', 'response'],
  [0, 1, 'PATCH /notifications/read-all'],
  [1, 2, 'Đặt doc_luc cho thông báo của User'],
  [1, 0, '200, số mục vừa đánh dấu', 'response'],
], 'Lịch và thông báo tồn tại qua lần khởi động lại. Khi bỏ lỡ nhiều kỳ, tạo tối đa một nhắc gần nhất.\nChu kỳ tháng giữ ngày gốc, dồn ngày vượt sang cuối tháng. Tạm dừng/xóa lịch ngừng nhắc mới.');

const admin = ['Admin / React', '#914d68', '#f9eaf0'];
await sequence('11-sequence-quan-tri', 'PlantCare AI 0.5 — Khóa tài khoản và kiểm duyệt', [admin, api, db, user], [
  [0, 1, 'GET /admin/accounts hoặc /admin/posts\nTìm kiếm và phân trang'],
  [1, 2, 'Xác thực phiên và quyền Admin'],
  [1, 0, 'Danh sách quản trị', 'response'],
  [0, 1, 'PATCH /admin/accounts/{id}\ndisabled=true'],
  [1, 2, 'Khóa giao dịch, kiểm tra lại phiên\nChặn tự khóa và Admin cuối'],
  [1, 2, 'Khóa tài khoản, thu hồi phiên\nGhi audit trong cùng giao dịch'],
  [1, 0, '200, trạng thái tài khoản', 'response'],
  [3, 1, 'Dùng phiên cũ hoặc đăng nhập lại'],
  [1, 3, '401 khi tài khoản đang khóa', 'error'],
  [0, 1, 'PATCH /admin/posts/{id}\nhidden=true'],
  [1, 2, 'Đặt an_luc và ghi hide_post\ntrong cùng giao dịch'],
  [1, 0, '200, bài ở trạng thái ẩn', 'response'],
  [3, 1, 'Người khác đọc bài bị ẩn'],
  [1, 3, '404 theo quyền xem hiện tại', 'error'],
], 'Cấp quyền Admin qua CLI cho tài khoản đã đăng ký. API ghi cần Origin và CSRF hợp lệ.\nMở khóa tài khoản cần đăng nhập mới. Chủ bài sửa nội dung vẫn giữ trạng thái ẩn do Admin.');

console.log(`Updated DOT sources from ${tables.size} tables and implemented API flows.`);
