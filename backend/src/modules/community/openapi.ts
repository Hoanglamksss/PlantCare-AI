const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, required,
});
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({ description, content: json(schema) });
const error = (description: string) => response(description, { $ref: '#/components/schemas/Error' });
const body = (schema: object) => ({ required: true, content: json(schema) });
const plantId = { $ref: '#/components/parameters/PlantId' };
const csrf = { $ref: '#/components/parameters/Csrf' };
const operation = (summary: string, operationId: string) => ({
  summary, operationId, tags: ['Cộng đồng'], security: [{ sessionCookie: [] }],
});
const commonErrors = { '400': error('Dữ liệu không hợp lệ.'), '401': error('Cần đăng nhập.') };
const mutationError = { '403': error('Origin hoặc CSRF token không hợp lệ.') };
const notFound = { '404': error('Không tìm thấy cây hoặc tài nguyên đang ẩn.') };
const rateError = { '429': error('Vượt giới hạn yêu cầu.') };

const uuid = { type: 'string', format: 'uuid' };
const text = { type: 'string' };
const timestamp = { ...text, format: 'date-time' };
const boolean = { type: 'boolean' };
const cursor = { ...text, pattern: '^[1-9][0-9]{0,18}$' };
const pagination = [
  { name: 'cursor', in: 'query', schema: cursor, description: 'Dùng nextCursor từ trang trước.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];
const historyCursor = { ...text, maxLength: 64 };
const historyPagination = [
  { name: 'cursor', in: 'query', schema: historyCursor, description: 'Dùng nextCursor từ trang trước.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
];
const page = (items: object, cursorSchema = cursor as object) => object({
  items: { type: 'array', items }, nextCursor: { ...cursorSchema, nullable: true },
});

const title = { ...text, minLength: 1, maxLength: 80 };
const caption = { ...text, nullable: true, maxLength: 1000 };
const commentBody = { ...text, minLength: 1, maxLength: 500 };
const share = object({ shared: boolean, title: { ...title, nullable: true }, caption, includeHistory: boolean });
const post = object({ id: uuid, title, caption, speciesCode: text, speciesName: text, author: text,
  commentCount: { type: 'integer', minimum: 0 }, createdAt: timestamp, isOwner: boolean, archived: boolean, includeHistory: boolean });
const comment = object({ id: uuid, author: text, body: commentBody, createdAt: timestamp, canDelete: boolean });
const note = object({ id: uuid, activity: { ...text, enum: ['watering', 'fertilizing', 'observation'] },
  note: { ...text, nullable: true }, happenedAt: timestamp, isJournalNote: boolean,
  photoUrls: { type: 'array', items: text, maxItems: 4 } });
const diagnosis = object({ id: uuid, status: { ...text, enum: ['queued', 'processing', 'completed', 'failed'] },
  outcome: { ...text, enum: ['healthy', 'uncertain', 'disease'], nullable: true }, createdAt: timestamp,
  findings: { type: 'array', items: object({ code: text, label: text, detail: text }) }, photoUrl: { ...text, nullable: true } });
const photo = { description: 'Ảnh chia sẻ, có Cache-Control private, no-store.', content: {
  'image/jpeg': { schema: { type: 'string', format: 'binary' } },
} };
const pathId = (name: string) => ({ name, in: 'path', required: true, schema: uuid });

export const communityPaths = {
  '/community/plants': {
    get: {
      ...operation('Xem cây được chia sẻ', 'listCommunityPlants'), parameters: pagination,
      responses: { '200': response('Danh sách cây được chia sẻ.', page(post)), ...commonErrors, ...rateError },
    },
  },
  '/community/plants/{plantId}': {
    parameters: [plantId],
    get: {
      ...operation('Xem hồ sơ cây được chia sẻ', 'getCommunityPlant'),
      responses: { '200': response('Hồ sơ cây được chia sẻ.', post), ...commonErrors, ...notFound, ...rateError },
    },
  },
  '/plants/{plantId}/share': {
    parameters: [plantId],
    get: {
      ...operation('Xem trạng thái chia sẻ cây của mình', 'getPlantShare'),
      responses: { '200': response('Trạng thái chia sẻ.', share), ...commonErrors, ...notFound },
    },
    put: {
      ...operation('Chia sẻ hoặc ẩn cây của mình', 'updatePlantShare'), parameters: [csrf],
      description: 'Áp dụng cả cây đã lưu trữ. includeHistory cho phép thành viên xem nhật ký, ảnh và kết quả gắn với cây, gồm nội dung được thêm sau này. Mặc định chỉ chia sẻ phần giới thiệu.',
      requestBody: body({ oneOf: [
        object({ shared: { ...boolean, enum: [true] }, title, caption, includeHistory: { ...boolean, default: false } }, ['shared', 'title']),
        object({ shared: { ...boolean, enum: [false] }, title: { ...title, nullable: true }, caption, includeHistory: { ...boolean, enum: [false] } }, ['shared']),
      ] }),
      responses: { '200': response('Trạng thái chia sẻ sau cập nhật.', share), ...commonErrors, ...mutationError, ...notFound, ...rateError },
    },
  },
  '/community/plants/{plantId}/notes': {
    parameters: [plantId],
    get: {
      ...operation('Xem nhật ký được chia sẻ', 'listCommunityNotes'), parameters: historyPagination,
      responses: { '200': response('Danh sách nhật ký từ mới tới cũ.', page(note, historyCursor)), ...commonErrors, ...notFound, ...rateError },
    },
  },
  '/community/plants/{plantId}/diagnoses': {
    parameters: [plantId],
    get: {
      ...operation('Xem lịch sử kiểm tra được chia sẻ', 'listCommunityDiagnoses'), parameters: historyPagination,
      responses: { '200': response('Lịch sử kiểm tra từ mới tới cũ.', page(diagnosis, historyCursor)), ...commonErrors, ...notFound, ...rateError },
    },
  },
  '/community/plants/{plantId}/notes/{noteId}/photos/{photoId}': {
    parameters: [plantId, pathId('noteId'), pathId('photoId')],
    get: {
      ...operation('Xem ảnh nhật ký được chia sẻ', 'getCommunityNotePhoto'),
      responses: { '200': photo, ...commonErrors, ...notFound, ...rateError, '503': error('Kho ảnh tạm gián đoạn.') },
    },
  },
  '/community/plants/{plantId}/diagnoses/{diagnosisId}/photo': {
    parameters: [plantId, pathId('diagnosisId')],
    get: {
      ...operation('Xem ảnh kiểm tra được chia sẻ', 'getCommunityDiagnosisPhoto'),
      responses: { '200': photo, ...commonErrors, ...notFound, ...rateError, '503': error('Kho ảnh tạm gián đoạn.') },
    },
  },
  '/community/plants/{plantId}/comments': {
    parameters: [plantId],
    get: {
      ...operation('Xem bình luận trên cây được chia sẻ', 'listCommunityComments'), parameters: pagination,
      responses: { '200': response('Danh sách bình luận.', page(comment)), ...commonErrors, ...notFound, ...rateError },
    },
    post: {
      ...operation('Đăng bình luận', 'postCommunityComment'), parameters: [csrf],
      requestBody: body(object({ body: commentBody })),
      responses: { '201': response('Bình luận vừa đăng.', comment), ...commonErrors, ...mutationError, ...notFound, ...rateError },
    },
  },
  '/community/plants/{plantId}/comments/{commentId}': {
    parameters: [plantId, { name: 'commentId', in: 'path', required: true, schema: uuid }],
    delete: {
      ...operation('Xóa bình luận của mình hoặc trên cây của mình', 'removeCommunityComment'), parameters: [csrf],
      responses: { '204': { description: 'Đã xóa bình luận.' }, ...commonErrors, ...mutationError, ...notFound },
    },
  },
};
