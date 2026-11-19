import { useState } from 'react';
import { Frown, Heart, Laugh } from 'lucide-react';
import { displayError, request } from './api';
import { ErrorNotice } from './ui';
import type { CommunityControls, CommunityPost, Reaction } from './communityTypes';

const reactions = [
  { value: 'heart', label: 'Yêu thích', Icon: Heart },
  { value: 'cry', label: 'Buồn', Icon: Frown },
  { value: 'laugh', label: 'Vui', Icon: Laugh },
] as const;

export function CommunityReactions({ post, csrfToken, onExpired, onChanged }: CommunityControls & {
  post: CommunityPost;
  onChanged: () => void;
}) {
  const [result, setResult] = useState({ reactions: post.reactions, myReaction: post.myReaction });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function react(reaction: Reaction) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await request<typeof result>(`/community/posts/${post.id}/reaction`, {
        method: 'PUT', csrfToken, body: { reaction: result.myReaction === reaction ? null : reaction },
      });
      setResult(data);
      onChanged();
    } catch (failure) {
      setError(displayError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return <div className="community-reaction-area">
    <div className="community-reactions" aria-label="Cảm xúc với bài viết">
      {reactions.map(({ value, label, Icon }) => <button key={value} type="button" aria-label={`${label}, ${result.reactions[value]}`} aria-pressed={result.myReaction === value} data-reaction={value} disabled={busy || !post.isPublished} onClick={() => void react(value)}>
        <Icon size={19} strokeWidth={1.7} fill={value === 'heart' && result.myReaction === value ? 'currentColor' : 'none'} aria-hidden="true" /><span>{result.reactions[value]}</span>
      </button>)}
    </div>
    <ErrorNotice message={error} />
  </div>;
}
