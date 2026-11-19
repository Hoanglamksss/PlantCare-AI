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
