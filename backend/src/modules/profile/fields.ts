import { z } from 'zod';

export const profilePhone = z.string().trim().max(32).transform((raw) => {
  const compact = raw.replace(/[ -]/g, '');
  return /^0[1-9][0-9]{8,9}$/.test(compact) ? `+84${compact.slice(1)}` : compact;
}).pipe(z.string().regex(/^\+[1-9][0-9]{7,14}$/));

export const profileDisplayName = z.string().trim().min(1).max(80).refine((value) => !value.includes('\0'));
