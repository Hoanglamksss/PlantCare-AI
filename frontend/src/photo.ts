import { useEffect, useState } from 'react';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhotoSize = 8 * 1024 * 1024;

export const acceptedPhotoTypes = imageTypes.join(',');

export function readPhoto(input: HTMLInputElement) {
  const photo = input.files?.[0];
  input.value = '';
  return photo;
}

export function validatePhoto(photo: File) {
  if (!photo.size) return 'Ảnh này không có dữ liệu. Hãy chọn ảnh khác.';
  if (photo.size > maxPhotoSize) return 'Ảnh tối đa 8 MiB. Hãy chọn ảnh nhỏ hơn.';
  if (photo.type && !imageTypes.includes(photo.type)) return 'Hãy chọn ảnh JPEG, PNG hoặc WebP.';
  return '';
}

export function usePhotoPreview(photo: File | null) {
  const [preview, setPreview] = useState<{ photo: File; url: string } | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview({ photo, url });
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return preview?.photo === photo ? preview.url : '';
}

const uploadBudget = 4_000_000;

export async function fitUploadPhotos(photos: File[]): Promise<File[]> {
  if (photos.reduce((sum, photo) => sum + photo.size, 0) <= uploadBudget) return photos;

  const perPhoto = Math.floor(uploadBudget / photos.length);
  const output: File[] = [];
  for (const photo of photos) {
    if (photo.size <= perPhoto) {
      output.push(photo);
      continue;
    }
    const bitmap = await createImageBitmap(photo).catch(() => {
      throw new Error('Không đọc được ảnh. Hãy thử chọn ảnh khác.');
    });
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Trình duyệt không thể xử lý ảnh này.');
      let converted = false;
      for (const maxEdge of [1800, 1200, 800]) {
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (blob && blob.size <= perPhoto) {
          output.push(new File([blob], photo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
          converted = true;
          break;
        }
      }
      if (!converted) throw new Error('Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh nhỏ hơn.');
    } finally {
      bitmap.close();
    }
  }
  return output;
}
