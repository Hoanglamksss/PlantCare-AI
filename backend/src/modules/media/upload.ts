import type { Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../../errors.js';

const maxUploadBytes = 8 * 1024 * 1024;
const maxGalleryPhotos = 4;

export function photoUpload(fieldSize: number) {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fields: 2, files: 1, fieldSize, fieldNameSize: 32, fileSize: maxUploadBytes + 1, parts: 4 },
  }).single('image');

  return (req: Request, res: Response) => new Promise<Buffer | undefined>((resolve, reject) => {
    parse(req, res, (error: unknown) => {
      if ((error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') || (req.file?.size ?? 0) > maxUploadBytes) {
        reject(new HttpError(413, 'IMAGE_TOO_LARGE', 'Mỗi ảnh tối đa 8 MiB.'));
      } else if (error || req.file?.size === 0) {
        reject(new HttpError(400, 'INVALID_INPUT', 'Dữ liệu tải ảnh không hợp lệ.'));
      } else {
        resolve(req.file?.buffer);
      }
    });
  });
}

function galleryStorage(): multer.StorageEngine {
  let totalSize = 0;
  return {
    _handleFile(_req, file, done) {
      const chunks: Buffer[] = [];
      let fileSize = 0;
      file.stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        fileSize += chunk.length;
        if (totalSize <= maxUploadBytes) chunks.push(chunk);
      });
      file.stream.on('end', () => {
        if (totalSize > maxUploadBytes) {
          done(new HttpError(413, 'IMAGE_TOO_LARGE', 'Tổng dung lượng ảnh tối đa 8 MiB.'));
          return;
        }
        done(null, { buffer: Buffer.concat(chunks, fileSize), size: fileSize });
      });
    },
    _removeFile(_req, file, done) {
      Object.assign(file, { buffer: undefined });
      done(null);
    },
  };
}

export function galleryUpload(fieldSize: number, maxFields = 2) {
  return (req: Request, res: Response) => new Promise<Buffer[]>((resolve, reject) => {
    const parse = multer({
      storage: galleryStorage(),
      limits: {
        fields: maxFields, files: maxGalleryPhotos, fieldSize, fieldNameSize: 32,
        fieldNestingDepth: 0, fileSize: maxUploadBytes, parts: maxGalleryPhotos + maxFields,
      },
    }).fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: maxGalleryPhotos }]);

    parse(req, res, (error: unknown) => {
      if (error instanceof HttpError) return reject(error);
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return reject(new HttpError(413, 'IMAGE_TOO_LARGE', 'Mỗi ảnh tối đa 8 MiB.'));
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
        return reject(new HttpError(400, 'TOO_MANY_IMAGES', `Mỗi mục có tối đa ${maxGalleryPhotos} ảnh.`));
      }
      const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
      const legacy = fields?.image ?? [];
      const images = fields?.images ?? [];
      const files = legacy.length ? legacy : images;
      if (error || (legacy.length && images.length) || files.some((file) => !file.size)) {
        return reject(new HttpError(400, 'INVALID_INPUT', 'Dữ liệu tải ảnh không hợp lệ.'));
      }
      resolve(files.map((file) => file.buffer));
    });
  });
}

export class PhotoUploadSlots {
  private readonly owners = new Set<string>();

  reserve(owner: string): 'reserved' | 'account-busy' | 'full' {
    if (this.owners.has(owner)) return 'account-busy';
    if (this.owners.size >= 2) return 'full';
    this.owners.add(owner);
    return 'reserved';
  }

  release(owner: string) {
    this.owners.delete(owner);
  }
}
