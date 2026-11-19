import { Algorithm } from '@node-rs/argon2';
import type { Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../errors.js';

export const accountEmail = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const currentPassword = z.string().min(1).max(128);
export const newPassword = z.string()
  .min(12, 'Mật khẩu phải có ít nhất 12 ký tự.')
  .max(128, 'Mật khẩu chỉ được có tối đa 128 ký tự.');
export const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

let activePasswordRequests = 0;

export function passwordValidationError(error: z.ZodError): HttpError | undefined {
  for (const issue of error.issues) {
    if (issue.path[0] !== 'password' && issue.path[0] !== 'newPassword') continue;
    if (issue.code === 'too_small' && issue.minimum === 12) {
      return new HttpError(400, 'PASSWORD_TOO_SHORT', 'Mật khẩu phải có ít nhất 12 ký tự.');
    }
    if (issue.code === 'too_big' && issue.maximum === 128) {
      return new HttpError(400, 'PASSWORD_TOO_LONG', 'Mật khẩu chỉ được có tối đa 128 ký tự.');
    }
  }
  return undefined;
}

export function rejectCredentialRate(res: Response, seconds: number): never {
  res.set('Retry-After', String(seconds));
  throw new HttpError(429, 'AUTH_RATE_LIMITED', 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
}

export async function withPasswordWork<T>(res: Response, work: () => Promise<T>): Promise<T> {
  if (activePasswordRequests >= 4) rejectCredentialRate(res, 1);
  activePasswordRequests += 1;
  try {
    return await work();
  } finally {
    activePasswordRequests -= 1;
  }
}
