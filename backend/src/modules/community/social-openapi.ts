import { communityPaths } from './openapi.js';

const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const text = { type: 'string' };
const boolean = { type: 'boolean' };
const csrf = { $ref: '#/components/parameters/Csrf' };
const pathId = (name: string) => ({ name, in: 'path', required: true, schema: uuid });
const postId = pathId('postId');
const commentId = pathId('commentId');
const photoId = pathId('photoId');
const operation = (summary: string, operationId: string) => ({
  summary, operationId, tags: ['Cộng đồng'], security: [{ sessionCookie: [] }],
});
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}),
});
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({ description, content: json(schema) });
const error = (description: string) => response(description, { $ref: '#/components/schemas/Error' });
const common = { '400': error('Dữ liệu không hợp lệ.'), '401': error('Cần đăng nhập.'),
  '404': error('Nội dung không tồn tại hoặc tài khoản không có quyền truy cập.'), '429': error('Vượt giới hạn yêu cầu.') };
const writeErrors = { ...common, '403': error('Origin hoặc token CSRF không hợp lệ.') };
const uploadErrors = { ...writeErrors, '413': error('Tổng dung lượng ảnh mới vượt 8 MiB hoặc ảnh vượt 16 megapixel.'),
  '415': error('Cần gửi JSON hoặc multipart/form-data.'), '422': error('Ảnh không hợp lệ.'), '503': error('Dịch vụ ảnh đang bận hoặc gián đoạn.') };
const photo = object({ id: uuid, url: text });
const photos = { type: 'array', items: photo, maxItems: 4 };
const reaction = { type: 'string', enum: ['heart', 'cry', 'laugh'], nullable: true };
const reactions = object({ heart: { type: 'integer', minimum: 0 }, cry: { type: 'integer', minimum: 0 }, laugh: { type: 'integer', minimum: 0 } });
const reactionResult = object({ reactions, myReaction: reaction });
const post = object({ id: uuid, plantId: uuid, title: text, note: text, happenedAt: timestamp,
  createdAt: timestamp, updatedAt: timestamp, author: text, isOwner: boolean, includeHistory: boolean,
  isPublished: boolean, moderationHidden: boolean, photos,
  plant: object({ speciesCode: text, speciesName: text, archived: boolean }),
  reactions, myReaction: reaction, commentCount: { type: 'integer', minimum: 0 } });
const comment = object({ id: uuid, postId: uuid, parentId: { ...uuid, nullable: true }, author: text, body: text,
  createdAt: timestamp, canDelete: boolean, moderationHidden: boolean, photos,
  likeCount: { type: 'integer', minimum: 0 }, liked: boolean, replyCount: { type: 'integer', minimum: 0 } });
const cursor = { ...text, pattern: '^[1-9][0-9]{0,18}$' };
const pagination = [
  { name: 'cursor', in: 'query', schema: cursor },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];
const page = (item: object) => object({ items: { type: 'array', items: item }, nextCursor: { ...cursor, nullable: true } });
const title = { type: 'string', minLength: 1, maxLength: 120 };
const note = { type: 'string', maxLength: 4000 };
const imageInput = { type: 'array', maxItems: 4, items: { type: 'string', format: 'binary' } };
const retained = { type: 'array', maxItems: 4, uniqueItems: true, items: uuid };
const postFields = { title, note, happenedAt: timestamp, includeHistory: { ...boolean, default: false } };
const input = (fields: Record<string, object>, required: string[] = [], multipart = true) => ({
  required: true, content: {
    ...json(object(fields, required)),
    ...(multipart ? { 'multipart/form-data': { schema: object({ ...fields, images: imageInput,
      ...('retainedPhotoIds' in fields ? { retainedPhotoIds: { type: 'string', description: 'Mảng JSON các ID ảnh giữ lại theo thứ tự. Bỏ trường này để giữ tất cả ảnh cũ.' } } : {}),
    }, required) } } : {}),
  },
});
const photoResponse = { description: 'Ảnh JPEG qua API, Cache-Control private, no-store.', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } };

function history(key: '/community/plants/{plantId}/notes' | '/community/plants/{plantId}/diagnoses'
  | '/community/plants/{plantId}/notes/{noteId}/photos/{photoId}' | '/community/plants/{plantId}/diagnoses/{diagnosisId}/photo', id: string) {
  const original = communityPaths[key];
  return { ...original, parameters: [postId, ...original.parameters.slice(1)],
    get: { ...original.get, operationId: id } };
}

export const socialPaths = {
  '/community/posts': {
    get: { ...operation('Xem các bài viết của cộng đồng', 'listCommunityPosts'),
      parameters: [...pagination, { name: 'mine', in: 'query', schema: { type: 'boolean', default: false } }],
      responses: { '200': response('Danh sách bài viết từ mới đến cũ.', page(post)), ...common } },
    post: { ...operation('Đăng bài mới gắn với cây của mình', 'createCommunityPost'), parameters: [csrf],
      description: 'Nhiều bài viết có thể gắn cùng một cây. Cần ghi chú hoặc ít nhất một ảnh. Mỗi bài tối đa 4 ảnh, tổng ảnh mới tối đa 8 MiB. includeHistory cho phép chia sẻ cả nhật ký và lịch sử kiểm tra của cây; mặc định false.',
      requestBody: input({ plantId: uuid, ...postFields }, ['plantId', 'title', 'happenedAt']),
      responses: { '201': response('Bài viết đã đăng.', post), ...uploadErrors } },
  },
  '/community/posts/{postId}': {
    parameters: [postId],
    get: { ...operation('Xem chi tiết bài viết', 'getCommunityPost'), responses: { '200': response('Bài viết.', post), ...common } },
    patch: { ...operation('Sửa bài viết của mình', 'updateCommunityPost'), parameters: [csrf],
      requestBody: input({ ...postFields, retainedPhotoIds: retained }),
      description: 'Cây gắn với bài viết giữ nguyên. retainedPhotoIds xác định ảnh cũ được giữ và thứ tự. Ảnh mới được thêm sau ảnh cũ. Tổng số ảnh sau sửa tối đa 4.',
      responses: { '200': response('Bài viết đã cập nhật.', post), ...uploadErrors } },
    delete: { ...operation('Xóa bài viết của mình', 'deleteCommunityPost'), parameters: [csrf],
      description: 'Xóa cả bình luận, phản hồi và ảnh gắn với bài. Nếu cây chỉ được chia sẻ nhờ bài vừa xóa và đã hết bài, quyền chia sẻ của cây được thu hồi.',
      responses: { '204': { description: 'Đã xóa bài viết và xếp ảnh vào hàng đợi dọn dẹp.' }, ...writeErrors } },
  },
  '/community/posts/{postId}/reaction': {
    parameters: [postId],
    put: { ...operation('Chọn hoặc bỏ biểu cảm bài viết', 'reactToCommunityPost'), parameters: [csrf],
      requestBody: input({ reaction }, ['reaction'], false), responses: { '200': response('Số biểu cảm và lựa chọn hiện tại.', reactionResult), ...writeErrors } },
  },
  '/community/posts/{postId}/photos/{photoId}': {
    parameters: [postId, photoId], get: { ...operation('Đọc ảnh bài viết', 'getCommunityPostPhoto'),
      responses: { '200': photoResponse, ...common, '503': error('Kho ảnh tạm gián đoạn.') } },
  },
  '/community/posts/{postId}/comments': {
    parameters: [postId],
    get: { ...operation('Xem bình luận hoặc câu trả lời trực tiếp', 'listCommunityPostComments'),
      parameters: [...pagination, { name: 'parentId', in: 'query', schema: uuid, description: 'Bỏ trống để lấy bình luận gốc.' }],
      responses: { '200': response('Một trang bình luận.', page(comment)), ...common } },
    post: { ...operation('Bình luận hoặc trả lời bằng chữ và ảnh', 'createCommunityPostComment'), parameters: [csrf],
      requestBody: input({ body: { type: 'string', maxLength: 1000 }, parentId: uuid }),
      description: 'Cần văn bản hoặc ảnh. parentId phải là bình luận cùng bài viết. Mỗi bình luận tối đa 4 ảnh và 8 MiB tổng ảnh mới.',
      responses: { '201': response('Bình luận đã đăng.', comment), ...uploadErrors } },
  },
  '/community/posts/{postId}/comments/{commentId}': {
    parameters: [postId, commentId], delete: { ...operation('Xóa bình luận và các câu trả lời', 'deleteCommunityPostComment'), parameters: [csrf],
      description: 'Tác giả bình luận hoặc chủ bài viết được xóa. Các câu trả lời con, lượt thích và ảnh được xóa theo.',
      responses: { '204': { description: 'Đã xóa bình luận.' }, ...writeErrors } },
  },
  '/community/posts/{postId}/comments/{commentId}/like': {
    parameters: [postId, commentId], put: { ...operation('Thích hoặc bỏ thích bình luận', 'likeCommunityPostComment'), parameters: [csrf],
      requestBody: input({ liked: boolean }, ['liked'], false), responses: { '200': response('Số lượt thích và trạng thái của mình.', object({ likeCount: { type: 'integer' }, liked: boolean })), ...writeErrors } },
  },
  '/community/posts/{postId}/comments/{commentId}/photos/{photoId}': {
    parameters: [postId, commentId, photoId], get: { ...operation('Đọc ảnh bình luận', 'getCommunityCommentPhoto'),
      responses: { '200': photoResponse, ...common, '503': error('Kho ảnh tạm gián đoạn.') } },
  },
  '/community/posts/{postId}/notes': history('/community/plants/{plantId}/notes', 'listPostSharedNotes'),
  '/community/posts/{postId}/diagnoses': history('/community/plants/{plantId}/diagnoses', 'listPostSharedDiagnoses'),
  '/community/posts/{postId}/notes/{noteId}/photos/{photoId}': history('/community/plants/{plantId}/notes/{noteId}/photos/{photoId}', 'getPostSharedNotePhoto'),
  '/community/posts/{postId}/diagnoses/{diagnosisId}/photo': history('/community/plants/{plantId}/diagnoses/{diagnosisId}/photo', 'getPostSharedDiagnosisPhoto'),
};
