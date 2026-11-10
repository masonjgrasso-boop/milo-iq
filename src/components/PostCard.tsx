// One post in a group feed.
//
// Automatic posts and notes share a card, because to a reader they are the
// same thing: something a person in this group did. The only difference is
// who wrote the sentence.
//
// Comments load when the card is opened rather than with the feed. Twenty
// posts would otherwise be twenty extra queries on every scroll, and the
// comments on a post nobody has opened are the ones nobody is reading.

import { useState } from 'react';
import {
  tallyReactions, toggleReaction, REACTIONS,
  type FeedComment, type FeedPost, type Reaction,
} from '../lib/feed';
import { Card } from './ui';

/** A rough "2h ago", which is all a feed needs. */
export function timeAgo(createdAt: unknown, now = Date.now()): string {
  const date = (createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
  if (!date) return 'just now';

  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return `${Math.round(days / 7)}w ago`;
}

/** Someone's picture, or their initials when their provider gave none. */
export function Avatar({ name, photo, size = 36 }: {
  name: string;
  photo?: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-pill
        text-xs font-extrabold text-brand"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/**
 * The little trend line on a weight post.
 *
 * Hand-drawn rather than pulled from the chart library: it is forty pixels
 * tall, has no axes and never needs a tooltip, so a chart component would be
 * three hundred kilobytes to draw six points.
 */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const step = 100 / (points.length - 1);

  const d = points
    .map((value, index) => {
      const x = index * step;
      const y = 34 - ((value - low) / span) * 28;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="mt-2 h-10 w-full"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="#1a3c2f" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function PostCard({
  post, uid, canModerate, comments, onReact, onDelete, onLoadComments, onComment,
  onDeleteComment,
}: {
  post: FeedPost;
  uid: string;
  /** True for the author of the post and for the group's admin. */
  canModerate: boolean;
  /** Null until they have been asked for. */
  comments: FeedComment[] | null;
  onReact: (reactions: Record<string, Reaction>) => void;
  onDelete: () => void;
  onLoadComments: () => void;
  onComment: (text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { counts, mine } = tallyReactions(post.reactions, uid);

  function openComments() {
    if (!open && comments === null) onLoadComments();
    setOpen(!open);
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    await onComment(text);
    setDraft('');
    setSending(false);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <Avatar name={post.authorName} photo={post.authorPhoto} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-extrabold text-ink">{post.authorName}</span>
          <span className="text-xs text-ink-faint">{timeAgo(post.createdAt)}</span>
        </div>
        {canModerate && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="shrink-0 rounded-chip px-2 py-1 text-xs font-bold text-ink-off
              transition hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>

      {post.headline && (
        <p className="text-[15px] font-bold leading-snug text-ink">{post.headline}</p>
      )}
      {post.detail && <p className="text-[13px] text-ink-mute">{post.detail}</p>}
      {post.body && (
        <p className="whitespace-pre-wrap text-[15px] leading-snug text-ink-soft">
          {post.body}
        </p>
      )}
      {post.spark && <Spark points={post.spark} />}
      {post.thumbUrl && (
        <img
          src={post.thumbUrl}
          alt=""
          className="max-h-64 w-full rounded-tile object-cover"
          loading="lazy"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {REACTIONS.map((reaction) => {
          const chosen = mine === reaction.key;
          return (
            <button
              key={reaction.key}
              type="button"
              aria-label={reaction.label}
              aria-pressed={chosen}
              onClick={() => onReact(toggleReaction(post.reactions, uid, reaction.key))}
              className={`flex h-9 min-w-[48px] items-center justify-center gap-1 rounded-chip
                px-2.5 text-sm transition ${
                  chosen
                    ? 'bg-brand-pill font-extrabold text-brand ring-1 ring-brand-pale'
                    : 'bg-muted text-ink-mute hover:bg-brand-wash'
                }`}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              {counts[reaction.key] > 0 && (
                <span className="tnum text-xs">{counts[reaction.key]}</span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={openComments}
          className="ml-auto h-9 rounded-chip px-2.5 text-xs font-bold text-ink-mute
            transition hover:text-brand"
        >
          {open ? 'Hide comments' : 'Comment'}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
          {comments === null ? (
            <p className="text-xs text-ink-ghost">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-ink-faint">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2 text-[13px]">
                  <Avatar name={comment.authorName} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-ink">{comment.authorName}</span>{' '}
                    <span className="text-ink-soft">{comment.text}</span>
                  </span>
                  {(comment.authorUid === uid || canModerate) && (
                    <button
                      type="button"
                      aria-label="Delete this comment"
                      onClick={() => onDeleteComment(comment.id)}
                      className="shrink-0 px-1 text-ink-off transition hover:text-danger"
                    >
                      &times;
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send();
              }}
              placeholder="Say something"
              aria-label="Write a comment"
              className="h-10 min-w-0 flex-1 rounded-input border border-line-in px-3 text-sm
                text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={!draft.trim() || sending}
              onClick={send}
              className="h-10 shrink-0 rounded-input bg-brand px-4 text-sm font-bold text-white
                transition hover:bg-brand-hi disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="flex flex-col gap-2.5 rounded-input bg-cream p-3">
          <p className="text-[13px] text-ink-soft">
            Delete this post? Its comments go with it.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-9 flex-1 rounded-input border border-line-in bg-surface text-xs
                font-bold text-ink"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="h-9 flex-1 rounded-input bg-danger text-xs font-bold text-white"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
