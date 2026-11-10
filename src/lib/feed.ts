// The group feed: what a post is, and what each kind of post says.
//
// Two sorts of post share one shape. A note is something a member typed. A
// digest is the app's own voice: everything worth saying about that person on
// that day, gathered into a single card.
//
// The digest is why automatic posts do not spam a feed. One member finishing
// a workout, keeping their rules, hitting a weight milestone and passing a
// 30-day streak on the same Tuesday is one card with four lines on it, not
// four cards. It works because the post id is derived from the member and the
// day, and each line is a keyed entry in a map on that post: writing a line
// merges one key, so running the same check twice is a no-op and a later line
// joins the card the earlier one made.
//
// Nothing here talks to Firestore. The wording lives here so it can be tested
// without a network, and so the same sentence cannot drift between the feed
// and anywhere else that renders a post.

import { type DayKey, type WeekKey } from './dates';
import { fromKg, lbToKg, weightUnitLabel } from './units';
import type { ShareKey } from './groups';
import type { Goal, UnitSystem } from './types';

/** A post is either somebody's own words or the app's daily digest. */
export type PostKind = 'note' | 'digest';

/** The things the app will speak up about. */
export type ItemKind =
  | 'weight'
  | 'calorieAvg'
  | 'calorieWeek'
  | 'rules'
  | 'workout'
  | 'milestone'
  | 'streak'
  | 'photo';

/**
 * Which sharing flag each line answers to.
 *
 * Stats are the two numbers; goals are the achievements. A note is the
 * member's own words, typed deliberately into one group, so it is gated on
 * nothing: choosing to write it is the choice.
 */
export const ITEM_FLAG: Record<ItemKind, ShareKey> = {
  // Stats are the weekly figures, reported whatever they say.
  weight: 'stats',
  calorieAvg: 'stats',
  // Goals hit are achievements: they only ever appear because something
  // went right, which is why meeting the calorie goal belongs here and the
  // bare weekly average belongs above.
  calorieWeek: 'goals',
  rules: 'goals',
  workout: 'goals',
  milestone: 'goals',
  streak: 'goals',
  photo: 'photos',
};

/**
 * Which lines are the weekly report rather than something that just
 * happened.
 *
 * These two post once at the top of a week, the next time the member opens
 * the app, rather than the moment they are true.
 */
export const WEEKLY_ITEMS: ItemKind[] = ['weight', 'calorieAvg'];

/** The order lines read in on a card, best news first. */
export const ITEM_ORDER: ItemKind[] = [
  'milestone', 'streak', 'calorieWeek', 'rules', 'workout', 'weight', 'calorieAvg',
  'photo',
];

export type Reaction = 'thumb' | 'fire' | 'flex';

export const REACTIONS: { key: Reaction; emoji: string; label: string }[] = [
  { key: 'thumb', emoji: '\u{1F44D}', label: 'Nice one' },
  { key: 'fire', emoji: '\u{1F525}', label: 'On fire' },
  { key: 'flex', emoji: '\u{1F4AA}', label: 'Strong' },
];

/** One line on a digest card. */
export interface PostItem {
  kind: ItemKind;
  headline: string;
  detail?: string;
  /** A few trend-weight points, in the author's units. */
  spark?: number[];
  thumbUrl?: string;
}

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
  /** A posted image, as a tokenised download URL. */
  imageUrl?: string;
  thumbUrl?: string;
  /** A digest's lines, keyed by kind so a repeat write replaces rather than adds. */
  items?: Partial<Record<ItemKind, PostItem>>;
  /** uid to reaction. One each, which is what keeps this map small. */
  reactions?: Record<string, Reaction>;
}

/** How many posts a page of the feed holds. */
export const PAGE_SIZE = 20;

/**
 * How long a post stays in a feed.
 *
 * A feed is for what people are doing now, so it is a rolling window rather
 * than an archive nobody scrolls to the bottom of. Every post and comment
 * carries the date it should go, and a Firestore TTL policy on that field
 * does the deleting — which is the only way to have it happen without a
 * backend, and happens whether or not anybody opens the app again.
 */
export const FEED_DAYS = 30;

/** When a post written now should be deleted. */
export function expiryFrom(now: Date = new Date()): Date {
  const at = new Date(now);
  at.setDate(at.getDate() + FEED_DAYS);
  return at;
}

/** The oldest post a feed should show, whether or not the TTL has caught up. */
export function feedCutoff(now: Date = new Date()): Date {
  const at = new Date(now);
  at.setDate(at.getDate() - FEED_DAYS);
  return at;
}

/** The longest a note can be, so one post cannot fill the screen. */
export const MAX_BODY = 500;

/**
 * The id of a member's digest for a day.
 *
 * Deterministic on purpose, and the whole anti-spam mechanism: every
 * automatic line that day lands on this one document.
 */
export function digestId(uid: string, day: DayKey): string {
  return `digest_${uid}_${day}`;
}

/** A digest's lines in reading order, with anything unrecognised dropped. */
export function digestItems(post: FeedPost): PostItem[] {
  const items = post.items ?? {};
  return ITEM_ORDER.map((kind) => items[kind]).filter(
    (item): item is PostItem => item !== undefined && typeof item.headline === 'string',
  );
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
): PostItem {
  const unit = weightUnitLabel(units);
  const amount = Math.abs(fromKg(changeKg, units)).toFixed(1);

  const headline = Math.abs(changeKg) < 0.05
    ? 'Holding steady this week'
    : `${changeKg < 0 ? 'Down' : 'Up'} ${amount} ${unit} this week`;

  return { kind: 'weight', headline, ...(spark.length > 1 ? { spark } : {}) };
}

/** A day on which every rule that applied was kept. */
export function rulesPost(met: number): PostItem {
  return {
    kind: 'rules',
    headline: met === 1 ? 'Hit their rule today' : `Hit all ${met} rules today`,
  };
}

/** A finished session, and anything in it that beat a previous best. */
export function workoutPost(routineName: string, newBests: string[] = []): PostItem {
  const headline = `Finished ${routineName}`;
  if (newBests.length === 0) return { kind: 'workout', headline };

  const named = newBests.slice(0, 3).join(', ');
  const rest = newBests.length > 3 ? ` and ${newBests.length - 3} more` : '';
  return { kind: 'workout', headline, detail: `New best on ${named}${rest}` };
}

/** A weekly progress photo. The thumbnail rides on the line itself. */
export function photoPost(week: WeekKey, thumbUrl?: string): PostItem {
  return {
    kind: 'photo',
    headline: 'Posted a progress photo',
    detail: week,
    ...(thumbUrl ? { thumbUrl } : {}),
  };
}

/** A week in which the average met the calorie goal. */
export function calorieWeekPost(daysLogged: number): PostItem {
  return {
    kind: 'calorieWeek',
    headline: 'Hit their calorie goal this week',
    detail: `${daysLogged} ${daysLogged === 1 ? 'day' : 'days'} logged`,
  };
}

/**
 * The week's calorie average against the goal, whatever it says.
 *
 * Part of stats rather than goals: it reports a number instead of
 * celebrating one, so it posts in a week that went badly as well as a week
 * that went well. Someone who only wants the good news shares goals and
 * leaves this off.
 */
export function calorieAvgPost(
  avgIntake: number,
  target: number,
  daysLogged: number,
): PostItem {
  const difference = avgIntake - target;
  const size = Math.abs(Math.round(difference)).toLocaleString();

  const detail = Math.abs(difference) < 25
    ? `Right on their ${target.toLocaleString()} goal`
    : `${size} ${difference > 0 ? 'above' : 'below'} their ` +
      `${target.toLocaleString()} goal`;

  return {
    kind: 'calorieAvg',
    headline: `Averaged ${Math.round(avgIntake).toLocaleString()} a day this week`,
    detail: `${detail} · ${daysLogged} ${daysLogged === 1 ? 'day' : 'days'} logged`,
  };
}

/** Milestones are counted every 2 kg, or every 5 lb for imperial members. */
export const MILESTONE_KG = 2;
export const MILESTONE_LB = 5;

export function milestoneStepKg(units: UnitSystem): number {
  return units === 'metric' ? MILESTONE_KG : lbToKg(MILESTONE_LB);
}

/**
 * How many whole milestones of progress toward the goal have been passed.
 *
 * Progress is measured in the goal's own direction from the weight recorded
 * when that goal started, so switching from losing to gaining starts the
 * count again rather than inheriting a tally that now means the opposite.
 * Maintaining has no milestones: there is no direction to count in.
 */
export function milestonesReached(
  startWeightKg: number,
  currentKg: number,
  goal: Goal,
  units: UnitSystem,
): number {
  if (goal === 'maintain') return 0;
  const progressKg = goal === 'lose' ? startWeightKg - currentKg : currentKg - startWeightKg;
  if (!(progressKg > 0)) return 0;
  return Math.floor(progressKg / milestoneStepKg(units));
}

export function milestonePost(count: number, units: UnitSystem, goal: Goal): PostItem {
  const step = units === 'metric' ? MILESTONE_KG : MILESTONE_LB;
  const unit = weightUnitLabel(units);
  const total = count * step;

  return {
    kind: 'milestone',
    headline: `${total} ${unit} ${goal === 'lose' ? 'down' : 'on'}`,
    detail: goal === 'lose' ? 'Another milestone toward their goal' : 'Another milestone gained',
  };
}

/** The streak lengths worth saying something about. */
export const STREAK_MILESTONES = [7, 30, 100];

/**
 * Consecutive days with food logged, ending today or yesterday.
 *
 * Counting from yesterday when today is blank is deliberate: a streak should
 * not appear broken at breakfast, before anyone has had a chance to log.
 */
export function loggingStreak(
  days: { date: DayKey; calories: number }[],
  today: DayKey,
): number {
  const logged = new Set(
    days.filter((day) => day.calories > 0).map((day) => day.date),
  );
  if (logged.size === 0) return 0;

  const step = (date: DayKey, back: number): DayKey => {
    const at = new Date(`${date}T00:00:00`);
    at.setDate(at.getDate() - back);
    return at.toISOString().slice(0, 10);
  };

  const start = logged.has(today) ? today : step(today, 1);
  if (!logged.has(start)) return 0;

  let streak = 0;
  while (logged.has(step(start, streak))) streak += 1;
  return streak;
}

/** The highest streak milestone this streak has reached, or 0 for none. */
export function streakMilestone(streak: number): number {
  let reached = 0;
  for (const milestone of STREAK_MILESTONES) {
    if (streak >= milestone) reached = milestone;
  }
  return reached;
}

export function streakPost(days: number): PostItem {
  return {
    kind: 'streak',
    headline: `${days} days logged in a row`,
    detail: days >= 100 ? 'Three figures' : 'Still going',
  };
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

/**
 * A digest with the given kinds of line taken out, or null if nothing is
 * left on it.
 *
 * This is what unticking a category does to history: a card that was only
 * ever a workout line goes entirely, and one that also carried a weight line
 * keeps that line and loses the rest.
 */
export function withoutItems(
  items: Partial<Record<ItemKind, PostItem>> | undefined,
  removing: ItemKind[],
): Partial<Record<ItemKind, PostItem>> | null {
  const kept: Partial<Record<ItemKind, PostItem>> = {};
  for (const [kind, item] of Object.entries(items ?? {})) {
    if (removing.includes(kind as ItemKind)) continue;
    if (item) kept[kind as ItemKind] = item;
  }
  return Object.keys(kept).length === 0 ? null : kept;
}

/** Which lines a sharing flag is responsible for. */
export function itemsFor(flag: ShareKey): ItemKind[] {
  return (Object.keys(ITEM_FLAG) as ItemKind[]).filter((kind) => ITEM_FLAG[kind] === flag);
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
