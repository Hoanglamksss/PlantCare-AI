const text = { type: 'string' };
const uuid = { ...text, format: 'uuid' };
const boolean = { type: 'boolean' };
const timestamp = { ...text, format: 'date-time' };
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({ description, content: json(schema) });
const body = (schema: object) => ({ required: true, content: json(schema) });
const error = (description: string) => response(description, { $ref: '#/components/schemas/Error' });
const operation = (summary: string, operationId: string) => ({
  summary, operationId, tags: ['Lịch và thông báo'], security: [{ sessionCookie: [] }],
});
const common = { '400': error('Dữ liệu không hợp lệ.'), '401': error('Cần đăng nhập.') };
const mutation = { '403': error('Origin hoặc CSRF token không hợp lệ.'), '429': error('Vượt giới hạn thao tác.') };
const csrf = { $ref: '#/components/parameters/Csrf' };
const parameters = (name: string) => [{ name, in: 'path', required: true, schema: uuid }];
const scheduleProperties = {
  plantId: uuid, activity: { ...text, enum: ['watering', 'fertilizing', 'observation', 'pruning', 'repotting', 'custom'] },
  title: { ...text, minLength: 1, maxLength: 120 }, startDate: { ...text, format: 'date', pattern: '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' },
  time: { ...text, pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' },
  recurrence: { ...text, enum: ['once', 'daily', 'weekly', 'monthly'] },
  interval: { type: 'integer', minimum: 1, maximum: 365 }, active: boolean,
};
const schedule = object({ id: uuid, ...scheduleProperties, nextRunAt: { ...timestamp, nullable: true },
  timezone: { ...text, enum: ['Asia/Ho_Chi_Minh'] } });
const notification = object({ id: uuid, title: text, body: text, plantId: uuid, createdAt: timestamp, readAt: { ...timestamp, nullable: true } });
const cursor = { ...text, pattern: '^[1-9][0-9]{0,18}$' };
const page = (item: object, extra: Record<string, object> = {}) => object({
  items: { type: 'array', items: item }, nextCursor: { ...text, nullable: true }, ...extra,
});

export const schedulePaths = {
  '/schedules': {
    get: {
      ...operation('Xem lịch chăm sóc của mình', 'listCareSchedules'),
      parameters: [{ name: 'cursor', in: 'query', schema: uuid }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 } }],
      responses: { '200': response('Lịch theo mã tăng dần.', page(schedule)), ...common },
    },
    post: {
      ...operation('Tạo lịch chăm sóc trên máy chủ', 'createCareSchedule'), parameters: [csrf],
      description: 'Múi giờ Asia/Ho_Chi_Minh (UTC+7). clientId tùy chọn giúp nhập lại lịch cũ an toàn. Lịch tháng giữ ngày gốc và dùng ngày cuối tháng khi cần.',
      requestBody: body(object({ ...scheduleProperties, clientId: uuid }, Object.keys(scheduleProperties))),
      responses: { '201': response('Lịch mới.', schedule), '200': response('Lịch đã có cùng clientId.', schedule), ...common, ...mutation,
        '404': error('Không tìm thấy cây của tài khoản.'), '409': error('Cây đã lưu trữ hoặc đạt giới hạn 500 lịch.'), '410': error('clientId thuộc lịch đã xóa.') },
    },
  },
  '/schedules/{scheduleId}': {
    parameters: parameters('scheduleId'),
    patch: {
      ...operation('Sửa hoặc tạm dừng lịch', 'updateCareSchedule'), parameters: [csrf],
      requestBody: body({ ...object(scheduleProperties, []), minProperties: 1 }),
      responses: { '200': response('Lịch đã cập nhật.', schedule), ...common, ...mutation,
        '404': error('Không tìm thấy lịch hoặc cây của mình.'), '409': error('Cây đang lưu trữ.') },
    },
    delete: {
      ...operation('Xóa lịch và dừng nhắc mới', 'deleteCareSchedule'), parameters: [csrf],
      responses: { '204': { description: 'Đã xóa lịch, giữ lịch sử thông báo.' }, ...common, ...mutation, '404': error('Không tìm thấy lịch.') },
    },
  },
  '/notifications': {
    get: {
      ...operation('Xem thông báo và số chưa đọc', 'listCareNotifications'),
      parameters: [{ name: 'cursor', in: 'query', schema: cursor }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }],
      responses: { '200': response('Thông báo mới trước.', page(notification, { unreadCount: { type: 'integer', minimum: 0 } })), ...common },
    },
  },
  '/notifications/read-all': {
    patch: {
      ...operation('Đánh dấu các thông báo là đã đọc', 'readAllCareNotifications'), parameters: [csrf], requestBody: body(object({})),
      responses: { '200': response('Số thông báo vừa cập nhật.', object({ updated: { type: 'integer', minimum: 0 } })), ...common, ...mutation },
    },
  },
  '/notifications/{notificationId}/read': {
    parameters: parameters('notificationId'),
    patch: {
      ...operation('Đọc một thông báo của mình', 'readCareNotification'), parameters: [csrf], requestBody: body(object({})),
      responses: { '200': response('Thông báo đã đọc.', notification), ...common, ...mutation, '404': error('Không tìm thấy thông báo.') },
    },
  },
};
