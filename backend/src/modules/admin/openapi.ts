const text = { type: 'string' };
const uuid = { ...text, format: 'uuid' };
const boolean = { type: 'boolean' };
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const json = (schema: object) => ({ 'application/json': { schema } });
const response = (description: string, schema: object) => ({ description, content: json(schema) });
const error = (description: string) => response(description, { $ref: '#/components/schemas/Error' });
const operation = (summary: string, operationId: string) => ({
  summary, operationId, tags: ['Quản trị'], security: [{ sessionCookie: [] }],
});
const common = { '400': error('Dữ liệu không hợp lệ.'), '401': error('Cần đăng nhập.'), '403': error('Cần quyền Admin hoặc token CSRF hợp lệ.') };
const account = object({ id: uuid, email: { ...text, format: 'email' }, displayName: { ...text, nullable: true },
  phone: { ...text, nullable: true }, role: { ...text, enum: ['user', 'admin'] }, disabled: boolean });
const post = object({ id: uuid, plantId: uuid, title: text, note: text, author: text,
  email: { ...text, format: 'email' }, createdAt: { ...text, format: 'date-time' }, hidden: boolean });
const page = (item: object) => object({ items: { type: 'array', items: item }, nextCursor: { ...text, nullable: true } });
const query = (cursor: object) => [
  { name: 'search', in: 'query', schema: { ...text, maxLength: 120 } },
  { name: 'cursor', in: 'query', schema: cursor, description: 'Dùng nextCursor của trang trước.' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];
const parameter = (name: string) => ({ name, in: 'path', required: true, schema: uuid });
const csrf = { $ref: '#/components/parameters/Csrf' };

export const adminPaths = {
  '/admin/accounts': {
    get: {
      ...operation('Tìm và xem tài khoản', 'listAdminAccounts'), parameters: query(uuid),
      responses: { '200': response('Danh sách tài khoản theo mã tăng dần.', page(account)), ...common },
    },
  },
  '/admin/accounts/{accountId}': {
    parameters: [parameter('accountId')],
    patch: {
      ...operation('Khóa hoặc mở lại tài khoản', 'moderateAccount'), parameters: [csrf],
      requestBody: { required: true, content: json(object({ disabled: boolean })) },
      description: 'Khóa tài khoản thu hồi tất cả phiên trong cùng giao dịch. Bảo vệ tài khoản Admin đang thao tác và Admin hoạt động cuối cùng.',
      responses: { '200': response('Tài khoản đã cập nhật.', account), ...common,
        '404': error('Không tìm thấy tài khoản.'), '409': error('Không thể khóa tài khoản quản trị này.') },
    },
  },
  '/admin/posts': {
    get: {
      ...operation('Tìm và xem bài đăng cộng đồng', 'listAdminPosts'),
      parameters: query({ ...text, pattern: '^[1-9][0-9]{0,18}$' }),
      responses: { '200': response('Nội dung bài đăng và thông tin tác giả, từ mới tới cũ.', page(post)), ...common },
    },
  },
  '/admin/posts/{postId}': {
    parameters: [parameter('postId')],
    patch: {
      ...operation('Ẩn hoặc hiện lại bài đăng', 'moderatePost'), parameters: [csrf],
      requestBody: { required: true, content: json(object({ hidden: boolean })) },
      responses: { '200': response('Trạng thái kiểm duyệt đã cập nhật.', post), ...common, '404': error('Không tìm thấy bài đăng.') },
    },
  },
};
