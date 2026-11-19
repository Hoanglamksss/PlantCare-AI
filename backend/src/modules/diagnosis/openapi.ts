import { screeningSpecies } from './guidance.js';

const uuid = { type: 'string', format: 'uuid' };
const species = { type: 'string', enum: screeningSpecies };
const state = { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] };
const session = [{ sessionCookie: [] }];
const csrf = { $ref: '#/components/parameters/Csrf' };
const diagnosisId = { in: 'path', name: 'diagnosisId', required: true, schema: uuid };
const acceptedSchema = {
  type: 'object', required: ['id', 'status'], properties: { id: uuid, status: state },
};
const resultSchema = {
  type: 'object',
  required: ['id', 'status', 'speciesCode', 'plantId', 'createdAt'],
  properties: {
    id: uuid,
    status: state,
    speciesCode: species,
    plantId: { ...uuid, nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    outcome: { type: 'string', enum: ['healthy', 'uncertain', 'disease'] },
    modelVersion: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', required: ['code', 'label', 'detail'],
        properties: { code: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    recommendation: { type: 'string' },
    possibleCauses: {
      type: 'array', description: 'Các khả năng cần đối chiếu khi ảnh có dấu hiệu.',
      items: {
        type: 'object', required: ['label', 'detail'],
        properties: { label: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    careSteps: { type: 'array', description: 'Các bước kiểm tra và xử lý tại nhà.', items: { type: 'string' } },
    retryable: { type: 'boolean', description: 'Chỉ xuất hiện khi lần phân tích thất bại.' },
  },
};

function json(description: string, schema: object) {
  return { description, content: { 'application/json': { schema } } };
}

function error(description: string) {
  return json(description, { $ref: '#/components/schemas/Error' });
}

function submission(description: string) {
  return {
    ...json(description, acceptedSchema),
    headers: { Location: { description: 'Đường dẫn xem trạng thái', schema: { type: 'string' } } },
  };
}

const protectedErrors = {
  '400': error('Dữ liệu gửi lên không hợp lệ.'),
  '401': error('Cần đăng nhập.'),
  '404': error('Không tìm thấy tài nguyên của tài khoản.'),
};
const writeErrors = { ...protectedErrors, '403': error('Origin hoặc CSRF token không hợp lệ.') };
const queueErrors = { ...writeErrors, '429': error('Vượt giới hạn cá nhân.'), '503': error('Dịch vụ đang bận hoặc gián đoạn.') };
const tag = ['Sàng lọc ảnh'];

export const diagnosisPaths = {
  '/diagnoses': {
    get: {
      operationId: 'listDiagnoses', tags: tag, summary: 'Xem lịch sử sàng lọc ảnh của mình', security: session,
      parameters: [
        { in: 'query', name: 'plantId', schema: uuid },
        { in: 'query', name: 'cursor', schema: uuid },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
      ],
      responses: {
        '200': json('Lịch sử từ mới đến cũ.', {
          type: 'object', required: ['items', 'nextCursor'],
          properties: { items: { type: 'array', items: resultSchema }, nextCursor: { ...uuid, nullable: true } },
        }),
        ...protectedErrors,
      },
    },
    post: {
      operationId: 'createDiagnosis', tags: tag, summary: 'Gửi ảnh lá để sàng lọc', security: session,
      description: 'Sàng lọc dấu hiệu thấy được trên lá cà chua, dưa leo, ớt, húng quế và bạc hà. Kết quả gợi ý nguyên nhân cần đối chiếu.',
      parameters: [
        csrf,
        {
          in: 'header', name: 'Idempotency-Key', required: true,
          schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[a-zA-Z0-9._-]+$' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object', required: ['image', 'speciesCode'],
              properties: {
                image: { type: 'string', format: 'binary', description: 'Một ảnh JPEG, PNG hoặc WebP, tối đa 8 MiB và 16 megapixel.' },
                speciesCode: species,
                plantId: uuid,
              },
            },
          },
        },
      },
      responses: {
        '200': submission('Yêu cầu này đã được tiếp nhận.'),
        '202': submission('Đã đưa ảnh vào hàng đợi.'),
        ...queueErrors,
        '409': error('Khóa yêu cầu đã được dùng cho dữ liệu khác.'),
        '410': error('Lần sàng lọc trước đã bị xóa.'),
        '413': error('Ảnh vượt giới hạn dung lượng hoặc số điểm ảnh.'),
        '415': error('Cần gửi tệp dưới dạng multipart/form-data.'),
        '422': error('Không đọc được ảnh hoặc loại cây không phù hợp.'),
      },
    },
  },
  '/diagnoses/{diagnosisId}': {
    parameters: [diagnosisId],
    get: {
      operationId: 'getDiagnosis', tags: tag, summary: 'Xem trạng thái hoặc kết quả', security: session,
      responses: { '200': json('Kết quả sàng lọc.', resultSchema), ...protectedErrors },
    },
    delete: {
      operationId: 'deleteDiagnosis', tags: tag, summary: 'Xóa lần sàng lọc của mình', security: session,
      parameters: [csrf],
      responses: { '204': { description: 'Kết quả đã xóa và ảnh được đưa vào hàng đợi dọn dẹp.' }, ...writeErrors },
    },
  },
  '/diagnoses/{diagnosisId}/photo': {
    parameters: [diagnosisId],
    get: {
      operationId: 'getDiagnosisPhoto', tags: tag, summary: 'Đọc ảnh riêng đã bỏ dữ liệu EXIF', security: session,
      responses: {
        '200': { description: 'Ảnh JPEG riêng tư.', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } },
        ...protectedErrors,
        '503': error('Kho ảnh tạm gián đoạn.'),
      },
    },
  },
  '/diagnoses/{diagnosisId}/retry': {
    parameters: [diagnosisId],
    post: {
      operationId: 'retryDiagnosis', tags: tag, summary: 'Thử lại phân tích khi có lỗi tạm thời', security: session,
      parameters: [csrf],
      responses: { '202': submission('Đã đưa ảnh trở lại hàng đợi.'), ...queueErrors, '409': error('Chưa thể thử lại lần sàng lọc này.') },
    },
  },
};
