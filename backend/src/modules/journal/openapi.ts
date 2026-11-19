const session = [{ sessionCookie: [] }];
const parameters = {
  plant: { $ref: '#/components/parameters/PlantId' },
  csrf: { $ref: '#/components/parameters/Csrf' },
  log: { name: 'logId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  photo: { name: 'photoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
};
const dateTime = { type: 'string', format: 'date-time' };
const noteText = { type: 'string', maxLength: 1000 };
const input = (required: string[], properties: Record<string, object>) => ({
  type: 'object', additionalProperties: false, required, properties,
});
const json = (schema: object) => ({ 'application/json': { schema } });
const errors = {
  '400': { description: 'Dữ liệu ghi chú hoặc ngày giờ không hợp lệ.', content: json({ $ref: '#/components/schemas/Error' }) },
  '401': { description: 'Cần đăng nhập.', content: json({ $ref: '#/components/schemas/Error' }) },
  '403': { description: 'Origin hoặc token CSRF không hợp lệ.', content: json({ $ref: '#/components/schemas/Error' }) },
  '404': { description: 'Không tìm thấy tài nguyên của tài khoản.', content: json({ $ref: '#/components/schemas/Error' }) },
  '413': { description: 'Ảnh vượt giới hạn dung lượng hoặc số điểm ảnh.', content: json({ $ref: '#/components/schemas/Error' }) },
  '415': { description: 'Cần gửi dữ liệu dưới dạng JSON hoặc multipart/form-data.', content: json({ $ref: '#/components/schemas/Error' }) },
  '422': { description: 'Không giải mã được ảnh hoặc ảnh nhỏ hơn 80 px mỗi chiều.', content: json({ $ref: '#/components/schemas/Error' }) },
  '429': { description: 'Vượt số lượt gửi ảnh hoặc đang xử lý một lượt gửi của tài khoản.', content: json({ $ref: '#/components/schemas/Error' }) },
  '503': { description: 'Dịch vụ ảnh ghi chú đang bận hoặc gián đoạn.', content: json({ $ref: '#/components/schemas/Error' }) },
};
const noteOutput = json({ $ref: '#/components/schemas/CareLog' });
const photoOperation = {
  tags: ['Nhật ký'],
  security: session,
  responses: {
    '200': { description: 'Ảnh JPEG đã loại bỏ siêu dữ liệu.', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } },
    '400': errors['400'], '401': errors['401'], '404': errors['404'], '503': errors['503'],
  },
};

export const journalOpenapiPaths = {
  '/plants/{plantId}/notes': {
    parameters: [parameters.plant],
    post: {
      operationId: 'createJournalNote',
      tags: ['Nhật ký'],
      summary: 'Thêm ghi chú có ngày giờ cho cây',
      description: 'Ghi chú riêng tư có thể thêm cho cả cây đang theo dõi và cây đã lưu trữ. Ngày giờ và ít nhất một nội dung văn bản hoặc ảnh là bắt buộc.',
      security: session,
      parameters: [parameters.csrf],
      requestBody: {
        required: true,
        content: {
          ...json(input(['note', 'happenedAt'], { note: { ...noteText, minLength: 1 }, happenedAt: dateTime })),
          'multipart/form-data': {
            schema: {
              ...input(['happenedAt'], {
                note: noteText, happenedAt: dateTime,
                image: { type: 'string', format: 'binary', description: 'Tên trường cũ cho một ảnh. Dùng image hoặc images.' },
                images: {
                  type: 'array', minItems: 1, maxItems: 4,
                  items: { type: 'string', format: 'binary' },
                  description: 'Gửi lặp trường images theo thứ tự mong muốn. Dùng JPEG, PNG hoặc WebP. Tổng tối đa 8 MiB, mỗi ảnh tối đa 16 megapixel.',
                },
              }),
              anyOf: [{ required: ['note'] }, { required: ['image'] }, { required: ['images'] }],
              not: { required: ['image', 'images'] },
            },
          },
        },
      },
      responses: { '201': { description: 'Ghi chú đã lưu.', content: noteOutput }, ...errors },
    },
  },
  '/plants/{plantId}/notes/{logId}': {
    parameters: [parameters.plant, parameters.log],
    patch: {
      operationId: 'updateJournalNoteDate',
      tags: ['Nhật ký'],
      summary: 'Đổi thời điểm của ghi chú',
      security: session,
      parameters: [parameters.csrf],
      requestBody: { required: true, content: json(input(['happenedAt'], { happenedAt: dateTime })) },
      responses: {
        '200': { description: 'Thời điểm đã cập nhật.', content: noteOutput },
        '400': errors['400'], '401': errors['401'], '403': errors['403'], '404': errors['404'],
      },
    },
  },
  '/plants/{plantId}/care-logs/{logId}/photo': {
    parameters: [parameters.plant, parameters.log],
    get: {
      ...photoOperation,
      operationId: 'getJournalPhoto',
      summary: 'Xem ảnh đầu tiên của ghi chú riêng tư',
    },
  },
  '/plants/{plantId}/care-logs/{logId}/photos/{photoId}': {
    parameters: [parameters.plant, parameters.log, parameters.photo],
    get: {
      ...photoOperation,
      operationId: 'getJournalGalleryPhoto',
      summary: 'Xem một ảnh trong bộ ảnh ghi chú riêng tư',
    },
  },
};
