export function maskEmail(email: string) {
  const separator = email.lastIndexOf('@');
  if (separator < 1 || separator === email.length - 1) return '****';
  const visibleLength = Math.min(3, separator - 1);
  return `${email.slice(0, visibleLength)}****${email.slice(separator)}`;
}
