import { communityPaths } from './modules/community/openapi.js';
import { adminPaths } from './modules/admin/openapi.js';
import { socialPaths } from './modules/community/social-openapi.js';
import { schedulePaths } from './modules/schedules/openapi.js';
import { diagnosisPaths } from './modules/diagnosis/openapi.js';
import { screeningSpecies } from './modules/diagnosis/guidance.js';
import { journalOpenapiPaths } from './modules/journal/openapi.js';
import { profilePaths } from './modules/profile/openapi.js';
import { careActivities } from './modules/journal/records.js';

const schema = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (value: object) => ({ 'application/json': { schema: value } });
const body = (name: string) => ({ required: true, content: json(schema(name)) });
const response = (description: string, name: string) => ({ description, content: json(schema(name)) });
const object = (properties: Record<string, object>, required: string[] = []) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}),
});
const parameter = (name: string) => ({ $ref: `#/components/parameters/${name}` });
const session = [{ sessionCookie: [] }];
const authErrors = { '401': response('Cần đăng nhập.', 'Error') };
const invalidInput = { '400': response('Dữ liệu không hợp lệ.', 'Error') };
const mutationErrors = { '403': response('Origin hoặc CSRF token không hợp lệ.', 'Error') };
const notFound = { '404': response('Không tìm thấy cây.', 'Error') };
const authLimit = { '429': response('Vượt giới hạn yêu cầu xác thực.', 'Error') };

const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date', nullable: true };
const timestamp = { type: 'string', format: 'date-time' };
const nickname = { type: 'string', minLength: 1, maxLength: 80 };
const note = { type: 'string', nullable: true, maxLength: 1000 };
const speciesCode = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$', example: 'tomato' };
const activity = { type: 'string', enum: careActivities };
const email = { type: 'string', format: 'email', example: 'demo@example.test' };
const page = (name: string) => object({
  items: { type: 'array', items: schema(name) }, nextCursor: { ...uuid, nullable: true },
}, ['items', 'nextCursor']);

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'PlantCare AI',
    version: '0.5.0',
    description: 'API chăm cây, sàng lọc ảnh và cộng đồng. Đăng nhập trên cùng tên miền để trình duyệt gửi cookie phiên. Dùng csrfToken từ đăng nhập hoặc /auth/me cho các thao tác ghi sau đăng nhập.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [{ name: 'Tài khoản' }, { name: 'Danh mục' }, { name: 'Cây của tôi' }, { name: 'Nhật ký' }, { name: 'Sàng lọc ảnh' }, { name: 'Cộng đồng' }, { name: 'Chatbot' }],
  paths: {
    ...diagnosisPaths,
    ...communityPaths,
    ...socialPaths,
    ...adminPaths,
    ...schedulePaths,
    ...journalOpenapiPaths,
    ...profilePaths,
    '/chat': {
      get: {
        operationId: 'listCareChat', tags: ['Chatbot'], summary: 'Mở hội thoại', security: session,
        responses: { '200': response('Các lượt gần nhất và cấu hình mô hình.', 'CareHistory'), ...authErrors },
      },
      post: {
        operationId: 'askCareChat', tags: ['Chatbot'], summary: 'Hỏi cách chăm cây', security: session,
        parameters: [parameter('Csrf')], requestBody: body('CareQuestion'),
        responses: { '200': response('Gợi ý chăm sóc và nguồn tham khảo nếu có.', 'CareAnswer'), ...invalidInput, ...authErrors, ...mutationErrors },
      },
    },
    '/chat/screening/{id}': {
      get: {
        operationId: 'readChatScreening', tags: ['Chatbot'], summary: 'Xem sàng lọc ảnh trong chat', security: session,
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
        responses: { '200': response('Dấu hiệu và kế hoạch theo ngày.', 'ChatScreening'), ...authErrors, ...invalidInput, ...notFound },
      },
    },
    '/auth/email-verification': {
      get: {
        operationId: 'getEmailVerification', tags: ['Tài khoản'], summary: 'Xem trạng thái xác minh email', security: session,
        responses: { '200': response('Trạng thái xác minh và khả năng gửi.', 'EmailVerification'), ...authErrors },
      },
    },
    '/auth/email-verification/send': {
      post: {
        operationId: 'sendEmailCode', tags: ['Tài khoản'], summary: 'Gửi mã xác minh email', security: session,
        parameters: [parameter('Csrf')],
        responses: { '200': response('Mã đã gửi hoặc email đã xác minh.', 'EmailCodeStatus'), ...authErrors, ...mutationErrors, ...authLimit },
      },
    },
    '/auth/email-verification/confirm': {
      post: {
        operationId: 'confirmEmailCode', tags: ['Tài khoản'], summary: 'Xác minh email bằng mã 6 chữ số', security: session,
        parameters: [parameter('Csrf')], requestBody: body('EmailCode'),
        responses: { '200': response('Email đã xác minh.', 'EmailCodeStatus'), ...invalidInput, ...authErrors, ...mutationErrors },
      },
    },
    '/auth/register/send': {
      post: {
        operationId: 'sendRegistrationCode', tags: ['Tài khoản'], summary: 'Gửi mã đăng ký',
        requestBody: body('EmailChallengeRequest'),
        responses: { '200': response('Trả mã định danh của yêu cầu xác minh.', 'EmailChallenge'), ...invalidInput, ...mutationErrors, ...authLimit,
          '503': response('Dịch vụ gửi email chưa sẵn sàng.', 'Error') },
      },
    },
    '/auth/register': {
      post: {
        operationId: 'register', tags: ['Tài khoản'], summary: 'Đăng ký tài khoản',
        requestBody: body('Register'),
        responses: { '200': response('Email đã xác minh và tài khoản đã được tạo.', 'Message'), ...invalidInput, ...mutationErrors, ...authLimit, '409': response('Email đã dùng.', 'Error') },
      },
    },
    '/auth/login': {
      post: {
        operationId: 'login', tags: ['Tài khoản'], summary: 'Đăng nhập',
        requestBody: body('Login'),
        responses: { '200': response('Phiên đã tạo và cookie đã đặt.', 'Session'), ...invalidInput, ...authErrors, ...mutationErrors, ...authLimit },
      },
    },
    '/auth/me': {
      get: {
        operationId: 'currentSession', tags: ['Tài khoản'], summary: 'Xem phiên hiện tại', security: session,
        responses: { '200': response('Tài khoản và token CSRF.', 'Session'), ...authErrors },
      },
    },
    '/auth/logout': {
      post: {
        operationId: 'logout', tags: ['Tài khoản'], summary: 'Thu hồi phiên', security: session,
        parameters: [parameter('Csrf')],
        responses: { '204': { description: 'Đã đăng xuất.' }, ...authErrors, ...mutationErrors },
      },
    },
    '/catalog/species': {
      get: {
        operationId: 'listSpecies', tags: ['Danh mục'], summary: 'Xem loài cây đang hỗ trợ theo dõi', security: session,
        responses: { '200': response('Danh mục đang hoạt động.', 'SpeciesList'), ...authErrors },
      },
    },
    '/plants': {
      get: {
        operationId: 'listPlants', tags: ['Cây của tôi'], summary: 'Danh sách cây của tài khoản', security: session,
        parameters: [parameter('Cursor'), parameter('Limit'), parameter('Archived')],
        responses: { '200': response('Một trang kết quả.', 'PlantPage'), ...invalidInput, ...authErrors },
      },
      post: {
        operationId: 'createPlant', tags: ['Cây của tôi'], summary: 'Tạo hồ sơ cây', security: session,
        parameters: [parameter('Csrf')], requestBody: body('CreatePlant'),
        responses: {
          '201': { ...response('Đã tạo cây.', 'Plant'), headers: { Location: { schema: { type: 'string' } } } },
          ...invalidInput, ...authErrors, ...mutationErrors,
          '422': response('Loài cây chưa được hỗ trợ.', 'Error'),
        },
      },
    },
    '/plants/{plantId}': {
      parameters: [parameter('PlantId')],
      get: {
        operationId: 'getPlant', tags: ['Cây của tôi'], summary: 'Xem hồ sơ cây', security: session,
        responses: { '200': response('Hồ sơ cây.', 'Plant'), ...invalidInput, ...authErrors, ...notFound },
      },
      patch: {
        operationId: 'updatePlant', tags: ['Cây của tôi'], summary: 'Cập nhật hoặc lưu trữ cây', security: session,
        parameters: [parameter('Csrf')], requestBody: body('UpdatePlant'),
        responses: { '200': response('Hồ sơ sau cập nhật.', 'Plant'), ...invalidInput, ...authErrors, ...mutationErrors, ...notFound },
      },
    },
    '/plants/{plantId}/care-logs': {
      parameters: [parameter('PlantId')],
      get: {
        operationId: 'listCareLogs', tags: ['Nhật ký'], summary: 'Xem nhật ký chăm sóc', security: session,
        parameters: [parameter('Cursor'), parameter('Limit')],
        responses: { '200': response('Nhật ký từ mới đến cũ.', 'CareLogPage'), ...invalidInput, ...authErrors, ...notFound },
      },
      post: {
        operationId: 'createCareLog', tags: ['Nhật ký'], summary: 'Ghi mốc chăm sóc', security: session,
        parameters: [parameter('Csrf')], requestBody: body('CreateCareLog'),
        responses: { '201': response('Đã lưu mốc chăm sóc.', 'CareLog'), ...invalidInput, ...authErrors, ...mutationErrors, ...notFound,
          '409': response('Cây đang lưu trữ.', 'Error') },
      },
    },
  },
  components: {
    securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'plantcare_session' } },
    parameters: {
      Csrf: { name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } },
      PlantId: { name: 'plantId', in: 'path', required: true, schema: uuid },
      Cursor: { name: 'cursor', in: 'query', description: 'Dùng nextCursor của trang trước.', schema: uuid },
      Limit: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      Archived: { name: 'archived', in: 'query', description: 'true chỉ lấy cây đã lưu trữ.', schema: { type: 'boolean', default: false } },
    },
    schemas: {
      CareQuestion: object({ question: { type: 'string', minLength: 1, maxLength: 600, example: 'Lá cà chua bị đốm nâu thì kiểm tra gì?' },
        speciesCode: { type: 'string', enum: screeningSpecies }, requestId: uuid, diagnosisId: uuid, contextDiagnosisId: uuid, plantId: uuid }, ['question']),
      CareHistory: object({ modelEnabled: { type: 'boolean' }, items: { type: 'array', items: object({
        requestId: uuid, question: { type: 'string' }, diagnosisId: { ...uuid, nullable: true }, plantId: { ...uuid, nullable: true }, reply: schema('CareReply'),
      }, ['requestId', 'question', 'diagnosisId', 'plantId', 'reply']) } }, ['modelEnabled', 'items']),
      ChatScreening: object({
        id: uuid, plantId: { ...uuid, nullable: true }, status: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] }, speciesCode,
        outcome: { type: 'string', nullable: true }, retryable: { type: 'boolean' },
        findings: { type: 'array', items: object({ code: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' } }) },
        guidance: { type: 'object', nullable: true },
        plan: { type: 'array', items: object({ when: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } }) },
      }, ['id', 'plantId', 'status', 'speciesCode', 'outcome', 'retryable', 'findings', 'guidance', 'plan']),
      EmailVerification: object({ verified: { type: 'boolean' }, enabled: { type: 'boolean' } }, ['verified', 'enabled']),
      EmailCodeStatus: object({ verified: { type: 'boolean' }, sent: { type: 'boolean' } }, ['verified']),
      EmailCode: object({ code: { type: 'string', pattern: '^[0-9]{6}$' } }, ['code']),
      CareAnswer: { type: 'object', properties: { interpretation: { type: 'string' }, origin: { type: 'string', enum: ['model', 'guide', 'journal'] }, requestId: uuid, diagnosisId: { ...uuid, nullable: true }, plantId: { ...uuid, nullable: true }, text: { type: 'string' }, photoSuggested: { type: 'boolean' }, speciesCode: { type: 'string', nullable: true }, source: { type: 'object', nullable: true } } },
      CareReply: object({ interpretation: { type: 'string' }, origin: { type: 'string', enum: ['model', 'guide', 'journal'] }, text: { type: 'string' }, photoSuggested: { type: 'boolean' }, speciesCode: { type: 'string', enum: [...screeningSpecies, null], nullable: true }, source: { ...object({
        title: { type: 'string' }, url: { type: 'string', format: 'uri' },
      }, ['title', 'url']), nullable: true } }, ['text', 'photoSuggested', 'speciesCode', 'source']),
      Message: object({ message: { type: 'string' } }, ['message']),
      Error: object({ code: { type: 'string' }, message: { type: 'string' }, requestId: uuid }, ['code', 'message', 'requestId']),
      EmailChallengeRequest: object({ email }, ['email']),
      EmailChallenge: object({ challengeId: uuid }, ['challengeId']),
      Register: object({ email, challengeId: uuid, code: { type: 'string', pattern: '^[0-9]{6}$' }, password: { type: 'string', format: 'password', minLength: 12, maxLength: 128 },
        displayName: { type: 'string', minLength: 1, maxLength: 80, description: 'Tên hiển thị tùy chọn, được bỏ khoảng trắng ở đầu và cuối.' },
        phone: { type: 'string', maxLength: 32, description: 'Số Việt Nam bắt đầu 0 hoặc số quốc tế bắt đầu +.' } }, ['email', 'password', 'challengeId', 'code']),
      Login: object({ email, password: { type: 'string', format: 'password', minLength: 1, maxLength: 128 } }, ['email', 'password']),
      User: object({ id: uuid, email, role: { type: 'string', enum: ['user', 'admin'] } }, ['id', 'email', 'role']),
      Session: object({ user: schema('User'), csrfToken: { type: 'string' } }, ['user', 'csrfToken']),
      Species: object({ code: speciesCode, name: { type: 'string' } }, ['code', 'name']),
      SpeciesList: object({ items: { type: 'array', items: schema('Species') } }, ['items']),
      Plant: object({ id: uuid, speciesCode, speciesName: { type: 'string' }, nickname, note, plantedOn: date,
        archivedAt: { ...timestamp, nullable: true } }, ['id', 'speciesCode', 'speciesName', 'nickname', 'note', 'plantedOn', 'archivedAt']),
      PlantPage: page('Plant'),
      CreatePlant: object({ speciesCode, nickname, note, plantedOn: date }, ['speciesCode', 'nickname']),
      UpdatePlant: { ...object({ nickname, note, plantedOn: date, archived: { type: 'boolean' } }), minProperties: 1 },
      CreateCareLog: object({ activity, note, happenedAt: timestamp }, ['activity', 'happenedAt']),
      CareLog: object({ id: uuid, activity, note, happenedAt: timestamp, photoUrl: { type: 'string', nullable: true },
        photoUrls: { type: 'array', items: { type: 'string' } }, isJournalNote: { type: 'boolean' } },
        ['id', 'activity', 'note', 'happenedAt', 'photoUrl', 'photoUrls', 'isJournalNote']),
      CareLogPage: page('CareLog'),
    },
  },
};
