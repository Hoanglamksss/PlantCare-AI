import { z } from 'zod';

export const careActivities = ['watering', 'fertilizing', 'observation'] as const;
export const journalTime = z.iso.datetime({ offset: true }).refine((value) =>
  !value.startsWith('0000-') && /(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value));

export interface CareLogRow {
  id: string;
  activity: (typeof careActivities)[number];
  note: string | null;
  happenedAt: Date;
  photoIds: string[];
  isJournalNote: boolean;
}

export const careLogColumns = `id, hoat_dong AS activity, ghi_chu AS note, xay_ra_luc AS "happenedAt",
  la_ghi_chu AS "isJournalNote"`;

export const careLogPhotoIds = `ARRAY(
  SELECT photo.anh_id FROM care_log_photos photo
  WHERE photo.care_log_id = log.id AND photo.tai_khoan_id = log.tai_khoan_id
  ORDER BY photo.position
) AS "photoIds"`;

export function careLogResponse({ photoIds, ...log }: CareLogRow, plantId: string) {
  const base = `/api/v1/plants/${plantId}/care-logs/${log.id}`;
  return {
    ...log,
    photoUrl: photoIds.length ? `${base}/photo` : null,
    photoUrls: photoIds.map((id) => `${base}/photos/${id}`),
  };
}
