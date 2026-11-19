import { readFileSync } from 'node:fs';
import { addAbortSignal, Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { HttpError } from '../../errors.js';

const maxStoredBytes = 4 * 1024 * 1024;
const timeout = () => AbortSignal.timeout(9_000);

const analysisSchema = z.object({
  outcome: z.enum(['healthy', 'uncertain']),
  modelVersion: z.string().min(1).max(100),
  quality: z.number().min(0).max(1),
  findings: z.array(z.object({
    code: z.string().min(1).max(50),
    label: z.string().min(1).max(160),
    detail: z.string().min(1).max(600),
  })).max(6),
});

export type Analysis = z.infer<typeof analysisSchema>;

const unavailable = () => new HttpError(503, 'SCREENING_UNAVAILABLE', 'Sàng lọc ảnh đang bận hoặc tạm gián đoạn. Vui lòng thử lại.');

export class MissingPhoto extends Error {}

export class PhotoServices {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly inference: URL,
  ) {}

  private async infer(path: string, photo: Buffer) {
    try {
      return await fetch(new URL(path, this.inference), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(photo),
        signal: timeout(),
      });
    } catch {
      throw unavailable();
    }
  }

  async prepare(photo: Buffer): Promise<Buffer> {
    const response = await this.infer('/prepare', photo);
    if ([400, 415, 422].includes(response.status)) {
      await response.body?.cancel().catch(() => {});
      throw new HttpError(422, 'INVALID_IMAGE', 'Hãy chọn một ảnh JPEG, PNG hoặc WebP rõ nét, ít nhất 80 px mỗi chiều.');
    }
    if (response.status === 413) {
      await response.body?.cancel().catch(() => {});
      throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt giới hạn kích thước hoặc độ phân giải.');
    }
    const length = Number(response.headers.get('content-length'));
    if (!response.ok || response.headers.get('content-type') !== 'image/jpeg' || length < 3 || length > maxStoredBytes) {
      await response.body?.cancel().catch(() => {});
      throw unavailable();
    }
    const cleaned = Buffer.from(await response.arrayBuffer().catch(() => { throw unavailable(); }));
    if (cleaned.length !== length || cleaned[0] !== 0xff || cleaned[1] !== 0xd8) throw unavailable();
    return cleaned;
  }

  async analyze(photo: Buffer): Promise<Analysis> {
    const response = await this.infer('/analyze', photo);
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw unavailable();
    }
    const result = analysisSchema.safeParse(await response.json().catch(() => null));
    if (!result.success) throw unavailable();
    return result.data;
  }

  async put(key: string, photo: Buffer) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: photo, ContentType: 'image/jpeg',
        CacheControl: 'private, no-store',
      }), { abortSignal: timeout() });
    } catch {
      throw unavailable();
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const signal = timeout();
      const object = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket, Key: key,
      }), { abortSignal: signal });
      if (!(object.Body instanceof Readable) || !object.ContentLength || object.ContentLength > maxStoredBytes) {
        if (object.Body instanceof Readable) object.Body.destroy();
        throw new MissingPhoto();
      }
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of addAbortSignal(signal, object.Body)) {
        const data = Buffer.from(chunk);
        length += data.length;
        if (length > object.ContentLength) throw new MissingPhoto();
        chunks.push(data);
      }
      if (length !== object.ContentLength) throw unavailable();
      return Buffer.concat(chunks, length);
    } catch (error) {
      if (error instanceof MissingPhoto || (error instanceof Error && error.name === 'NoSuchKey')) {
        throw new MissingPhoto();
      }
      throw unavailable();
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket, Key: key,
    }), { abortSignal: timeout() });
  }
}

export function configuredPhotoServices(): PhotoServices | undefined {
  const { INFERENCE_URL, S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_ACCESS_KEY_FILE, S3_SECRET_KEY, S3_SECRET_KEY_FILE } = process.env;
  if (!INFERENCE_URL && !S3_ENDPOINT) return undefined;
  if (!INFERENCE_URL || !S3_ENDPOINT || !S3_BUCKET || (!S3_ACCESS_KEY && !S3_ACCESS_KEY_FILE) || (!S3_SECRET_KEY && !S3_SECRET_KEY_FILE)) {
    throw new Error('Incomplete image storage or inference configuration.');
  }
  const secretAccessKey = S3_SECRET_KEY ?? readFileSync(S3_SECRET_KEY_FILE!, 'utf8').trim();
  const accessKeyId = S3_ACCESS_KEY ?? readFileSync(S3_ACCESS_KEY_FILE!, 'utf8').trim();
  const inference = new URL(INFERENCE_URL);
  const endpoint = new URL(S3_ENDPOINT);
  if (!accessKeyId || !secretAccessKey || ![inference, endpoint].every((url) => ['http:', 'https:'].includes(url.protocol))) {
    throw new Error('Invalid image storage or inference configuration.');
  }
  return new PhotoServices(new S3Client({
    endpoint: endpoint.href,
    region: S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
  }), S3_BUCKET, inference);
}
