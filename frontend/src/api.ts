export type Session = {
  user: { id: string; email: string; role: 'user' | 'admin' };
  csrfToken: string;
};

export type AccountProfile = {
  email: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

export type Species = { code: string; name: string };

export const cropLabels = { tomato: 'Cà chua', cucumber: 'Dưa leo', chili: 'Ớt', basil: 'Húng quế', mint: 'Bạc hà' } as const;
export type CropCode = keyof typeof cropLabels;
export function isCropCode(value: string | null): value is CropCode {
  return value !== null && Object.hasOwn(cropLabels, value);
}

export type Scan = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  speciesCode: string;
  plantId: string | null;
  createdAt: string;
  outcome?: 'healthy' | 'uncertain' | 'disease';
  findings?: { code: string; label: string; detail: string }[];
  possibleCauses?: { label: string; detail: string }[];
  careSteps?: string[];
  recommendation?: string;
  retryable?: boolean;
};

export type Plant = {
  id: string;
  speciesCode: string;
  speciesName: string;
  nickname: string;
  plantedOn: string | null;
  note: string | null;
  archivedAt: string | null;
};

export const activities = {
  watering: 'Tưới nước',
  fertilizing: 'Bón phân',
  observation: 'Quan sát',
} as const;

export type CareLog = {
  id: string;
  activity: keyof typeof activities;
  note: string | null;
  happenedAt: string;
  photoUrl: string | null;
  photoUrls: string[];
  isJournalNote: boolean;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly retryAfter?: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown> | FormData;
  csrfToken?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, csrfToken, idempotencyKey, signal } = options;
  const headers = new Headers({ Accept: 'application/json' });
  const multipart = body instanceof FormData;
  if (body && !multipart) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  const response = await fetch(`/api/v1${path}`, {
    method,
    body: multipart ? body : body ? JSON.stringify(body) : undefined,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: unknown; code?: unknown; requestId?: unknown } | null;
    const message = response.status < 500 && typeof error?.message === 'string'
      ? error.message
      : 'Dịch vụ đang bận. Vui lòng thử lại sau.';
    const code = typeof error?.code === 'string' ? error.code : undefined;
    const seconds = Number(response.headers.get('Retry-After'));
    const retryAfter = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
    const requestId = typeof error?.requestId === 'string' ? error.requestId : undefined;
    throw new ApiError(response.status, message, code, retryAfter, requestId);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function displayError(error: unknown, onExpired?: () => void) {
  if (error instanceof ApiError) {
    if (error.status === 401) onExpired?.();
    if (error.code === 'EMAIL_DELIVERY_UNAVAILABLE') return 'Chưa gửi được mã xác minh. Vui lòng thử lại sau.';
    return error.message;
  }

  return 'Kết nối bị gián đoạn. Vui lòng thử lại.';
}
