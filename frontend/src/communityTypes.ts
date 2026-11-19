export type Reaction = 'heart' | 'cry' | 'laugh';
export type CommunityPhoto = { id: string; url: string };

export interface CommunityPost {
  id: string;
  plantId: string;
  title: string;
  note: string;
  happenedAt: string;
  createdAt: string;
  author: string;
  isOwner: boolean;
  isPublished: boolean;
  includeHistory: boolean;
  photos: CommunityPhoto[];
  plant: { speciesCode: string; speciesName: string; archived: boolean };
  reactions: Record<Reaction, number>;
  myReaction: Reaction | null;
  commentCount: number;
  moderationHidden?: boolean;
}

export interface CommunityComment {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
  photos: CommunityPhoto[];
  likeCount: number;
  liked: boolean;
  replyCount: number;
  moderationHidden?: boolean;
}

export interface CommunityControls {
  csrfToken: string;
  onExpired: () => void;
}

export const communityDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });
export const communityDateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
