const session = [{ sessionCookie: [] }];
const csrf = { $ref: '#/components/parameters/Csrf' };
const email = { type: 'string', format: 'email', maxLength: 254 };
const displayName = { type: 'string', minLength: 1, maxLength: 80, nullable: true };
const phone = { type: 'string', maxLength: 32, description: 'Số Việt Nam bắt đầu 0 hoặc số quốc tế bắt đầu +.' };
const profile = {
  type: 'object', additionalProperties: false, required: ['email', 'displayName', 'phone', 'avatarUrl'],
  properties: { email, displayName, phone: { ...phone, nullable: true }, avatarUrl: { type: 'string', nullable: true } },
};
const binary = { type: 'string', format: 'binary' };
const password = { type: 'string', format: 'password', maxLength: 128 };
const json = (schema: object) => ({ 'application/json': { schema } });
const body = (properties: Record<string, object>, required?: string[]) => ({
  required: true,
  content: json({ type: 'object', additionalProperties: false, ...(required ? { required } : {}), properties }),
});
const error = (description: string) => ({ description, content: json({ $ref: '#/components/schemas/Error' }) });
const invalid = error('Dữ liệu hồ sơ không hợp lệ.');
const unauthorized = error('Cần đăng nhập.');
const forbidden = error('Origin hoặc mã CSRF không hợp lệ.');
const unavailable = error('Dịch vụ ảnh đại diện đang bận hoặc tạm gián đoạn.');
const profileResult = { description: 'Hồ sơ riêng của tài khoản đang đăng nhập.', content: json(profile) };

export const profilePaths = {
  '/profile': {
    get: {
      operationId: 'getProfile', tags: ['Tài khoản'], summary: 'Xem hồ sơ cá nhân', security: session,
      responses: { '200': profileResult, '401': unauthorized },
    },
    patch: {
      operationId: 'updateProfile', tags: ['Tài khoản'], summary: 'Cập nhật tên hiển thị hoặc số điện thoại',
      description: 'Gửi ít nhất một trường. Giá trị null xóa trường tương ứng.',
      security: session, parameters: [csrf],
      requestBody: body({ displayName, phone: { ...phone, nullable: true } }),
      responses: { '200': profileResult, '400': invalid, '401': unauthorized, '403': forbidden },
    },
  },
  '/profile/credentials': {
    patch: {
      operationId: 'changeCredentials', tags: ['Tài khoản'], summary: 'Đổi email hoặc mật khẩu',
      description: 'Nhập mật khẩu hiện tại và ít nhất một thay đổi. Khi thành công, tất cả phiên đăng nhập của tài khoản bị thu hồi.',
      security: session, parameters: [csrf],
      requestBody: body({ currentPassword: { ...password, minLength: 1 }, email, newPassword: { ...password, minLength: 12 } }, ['currentPassword']),
      responses: {
        '204': { description: 'Đã đổi thông tin đăng nhập. Cần đăng nhập lại.' }, '400': invalid, '401': unauthorized,
        '403': error('Origin, mã CSRF hoặc mật khẩu hiện tại không hợp lệ.'),
        '409': error('Email đã được sử dụng hoặc thông tin đăng nhập vừa thay đổi.'),
        '429': error('Vượt giới hạn số lượt xác thực.'),
      },
    },
  },
  '/profile/avatar': {
    get: {
      operationId: 'getProfileAvatar', tags: ['Tài khoản'], summary: 'Xem ảnh đại diện riêng của mình', security: session,
      parameters: [{ name: 'version', in: 'query', schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Ảnh JPEG đã loại bỏ siêu dữ liệu.', content: { 'image/jpeg': { schema: binary } } },
        '400': invalid, '401': unauthorized, '404': error('Không tìm thấy ảnh đại diện.'), '503': unavailable,
      },
    },
    put: {
      operationId: 'putProfileAvatar', tags: ['Tài khoản'], summary: 'Tải lên hoặc thay ảnh đại diện',
      security: session, parameters: [csrf],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', required: ['image'], properties: {
          image: { ...binary, description: 'Một ảnh JPEG, PNG hoặc WebP, tối đa 8 MiB và 16 megapixel.' },
        } } } },
      },
      responses: {
        '200': profileResult, '400': invalid, '401': unauthorized, '403': forbidden,
        '413': error('Ảnh vượt giới hạn dung lượng hoặc số điểm ảnh.'),
        '415': error('Cần gửi ảnh dưới dạng multipart/form-data.'),
        '422': error('Không giải mã được ảnh hoặc ảnh nhỏ hơn 80 px mỗi chiều.'),
        '429': error('Vượt giới hạn tải ảnh.'), '503': unavailable,
      },
    },
    delete: {
      operationId: 'deleteProfileAvatar', tags: ['Tài khoản'], summary: 'Xóa ảnh đại diện',
      security: session, parameters: [csrf],
      responses: { '204': { description: 'Đã bỏ ảnh đại diện.' }, '401': unauthorized, '403': forbidden },
    },
  },
};
