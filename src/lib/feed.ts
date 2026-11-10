// The group feed: what a post is, and what each kind of post says.
//
// Two sorts of post share one shape. A note is something a member typed. An
// automatic post is the app noticing something worth saying — a week's weight
// trend, a day's rules kept, a workout finished, a progress photo — and
// writing it in the member's name.
//
// Automatic posts carry a deterministic id built from the member, the kind
// and the period it covers. Writing one is therefore idempotent: the app can
// try to post "Monday's rules" as often as it likes and there will only ever
// be one such post. Without that, every reopen of the app would add a
// duplicate, and there is no backend here to clean up after it.
//
// Nothing here talks to Firestore. The wording lives here so it can be tested
// without a network, and so the same sentence cannot drift between the feed
// and anywhere else that renders a post.

import { type DayKey, type WeekKey } from './dates';
import { fromKg, weightUnitLabel } from './units';
import type { ShareKey } from './groups';
import type { UnitSystem } from './types';

export type PostKind = 'note' | 'weight' | 'rules' | 'workout' | 'photo';

export type Reaction = 'thumb' | 'fire' | 'flex';

export const REACTIONS: { key: Reaction; emoji: string; label: string }[] = [
  { key: 'thumb', emoji: '\u{1F44D}', label: 'Nice one' },
  { key: 'fire', emoji: '\u{1F525}', label: 'On fire' },
  { key: 'flex', emoji: '\u{1F4AA}', label: 'Strong' },
];

/**
 * Which sharing flag each kind of post answers to.
 *
 * A note is the member's own words, typed deliberately into one group, so it
 * is not gated on anything: choosing to write it is the choice. Everything
 * else is the app speaking on their behalf and only ever does so for a
 * category they have turned on.
 */
export const KIND_FLAG: Record<PostKind, ShareKey | null> = {
  note: null,
  weight: 'weight',
  rules: 'rules',
  workout: 'workouts',
  photo: 'photos',
};

export interface FeedComment {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt?: unknown;
}

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  /** The author's avatar, if their sign-in provider gave one. */
  authorPhoto?: string;
  kind: PostKind;
  createdAt?: unknown;
  /** What the member typed: the whole of a note, or a caption on a photo. */
  body?: string;
  /** An automatic post's own sentence, written when the post was made. */
  headline?: string;
  detail?: string;
  /** A posted image, as a tokenised download URL. */
  imageUrl?: string;
  thumbUrl?: string;
  /** A few trend-weight points, in the author's units, for a weight post. */
  spark?: number[];
  /** uid to reaction. One each, which is what keeps this map small. */
  reactions?: Record<string, Reaction>;
}

/** How many posts a page of the feed holds. */
export const PAGE_SIZE = 20;

/** The longest a note can be, so one post cannot fill the screen. */
export const MAX_BODY = 500;

/**
 * The id for an automatic post.
 *
 * Deterministic on purpose: the same event always produces the same id, so
 * re-running the check that writes it can never duplicate it.
 */
export function autoPostId(kind: PostKind, uid: string, period: string): string {
  return `${kind}_${uid}_${period}`;
}

export interface AutoPostBody {
  headline: string;
  detail?: string;
  spark?: number[];
  /** A photo post carries the same thumbnail the group already sees. */
  thumbUrl?: string;
}

/**
 * A week's weight movement, in the member's own units.
 *
 * Shares a change, never a weight. What a group needs is the direction of
 * travel; the number on the scale is a far bigger ask than most people
 * realise, and the mirror has never shared it either.
 */
export function weightPost(
  changeKg: number,
  units: UnitSystem,
  spark: number[] = [],
): AutoPostBody {
  const unit = weightUnitLabel(units);
  const amount = Math.abs(fromKg(changeKg, units)).toFixed(1);

  const headline = Math.abs(changeKg) < 0.05
    ? 'Holding steady this week'
    : `${changeKg < 0 ? 'Down' : 'Up'} ${amount} ${unit} this week`;

  return { headline, ...(spark.length > 1 ? { spark } : {}) };
}

/** A day on which every rule that applied was kept. */
export function rulesPost(met: number): AutoPostBody {
  return {
    headline: met === 1 ? 'Hit their rule today' : `Hit all ${met} rules today`,
  };
}

/** A finished session, and anything in it that beat a previous best. */
export function workoutPost(routineName: string, newBests: string[] = []): AutoPostBody {
  const headline = `Finished ${routineName}`;
  if (newBests.length === 0) return { headline };

  const named = newBests.slice(0, 3).join(', ');
  const rest = newBests.length > 3 ? ` and ${newBests.length - 3} more` : '';
  return {
    headline,
    detail: `New best on ${named}${rest}`,
  };
}

/** A weekly progress photo. The thumbnail rides on the post itself. */
export function photoPost(week: WeekKey): AutoPostBody {
  return { headline: `Posted a progress photo`, detail: week };
}

/**
 * Posts whose author is still in the group, in the order given.
 *
 * Leaving, being removed, or turning a category off deletes that member's
 * posts from the group. This is the second half of that promise: a delete is
 * a batch of writes and a batch can fail half way, so the feed also refuses
 * to render anything whose author is no longer a member. Belt and braces,
 * because the cost of the braces is one set lookup per post.
 */
export function visiblePosts(posts: FeedPost[], memberUids: string[]): FeedPost[] {
  const members = new Set(memberUids);
  return posts.filter((post) => members.has(post.authorUid));
}

/** How many of each reaction a post has, and what the reader chose. */
export function tallyReactions(
  reactions: Record<string, Reaction> | undefined,
  uid: string,
): { counts: Record<Reaction, number>; mine: Reaction | null } {
  const counts: Record<Reaction, number> = { thumb: 0, fire: 0, flex: 0 };
  let mine: Reaction | null = null;

  for (const [who, reaction] of Object.entries(reactions ?? {})) {
    if (counts[reaction] === undefined) continue;
    counts[reaction] += 1;
    if (who === uid) mine = reaction;
  }
  return { counts, mine };
}

/**
 * The reactions map after someone taps one.
 *
 * Tapping the reaction you already left takes it off, which is the behaviour
 * every other app has trained people to expect.
 */
export function toggleReaction(
  reactions: Record<string, Reaction> | undefined,
  uid: string,
  reaction: Reaction,
): Record<string, Reaction> {
  const next = { ...(reactions ?? {}) };
  if (next[uid] === reaction) delete next[uid];
  else next[uid] = reaction;
  return next;
}

/**
 * The id of a nudge.
 *
 * Keyed by who it is for and the day it was sent, which is what enforces one
 * nudge per person per day: the rules allow a member to create this document
 * but never to overwrite one, so the second attempt in a day is refused by
 * the database rather than by a check the client could skip.
 */
export function nudgeId(toUid: string, day: DayKey): string {
  return `${toUid}_${day}`;
}

export interface Nudge {
  id: string;
  groupId: string;
  groupName: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  day: DayKey;
  seen: boolean;
  createdAt?: unknown;
}

/** What the nudged member reads when they next open the app. */
export function nudgeMessage(nudge: { fromName: string; groupName: string }): string {
  return `${nudge.fromName} nudged you from ${nudge.groupName}. Log something today and it clears.`;
}
