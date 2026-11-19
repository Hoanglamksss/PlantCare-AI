export function newPasswordError(password: string, optional = false) {
  if (optional && !password) return '';
  if (password.length < 12) return 'Mật khẩu quá ngắn. Vui lòng nhập ít nhất 12 ký tự.';
  if (password.length > 128) return 'Mật khẩu quá dài. Vui lòng nhập tối đa 128 ký tự.';
  return '';
}
