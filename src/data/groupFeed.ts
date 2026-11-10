// What gets posted, and when.
//
// Three different timings, which is why this is one module rather than
// scattered through the screens that trigger it:
//
//   immediate   something that just happened, posted on the spot: today's
//               rules all kept, a workout finished, a photo uploaded, and
//               the achievements that logging can cross (a streak, a weight
//               milestone, a week's calorie goal met).
//   weekly      the report: the week's weight trend and calorie average,
//               posted once at the top of a new week, the next time the
//               member opens the app.
//   daily       the mirrors each group reads, refreshed so a gap in logging
//               actually shows as one.
//
// Nothing here can post twice. A line is keyed by its kind on a card keyed by
// the member and the day, so a repeat write replaces rather than adds; and
// the three achievements that persist for days record the highest already
// announced on the member's own pointer, so a 30-day streak is mentioned once
// rather than every morning for ten weeks.

import {
  listMyGroups, publishShare, recordAnnounced, type Membership,
} from './groups';
import { listDays } from './days';
import { listRules } from './rules';
import { listExercises } from './workouts';
import { listPhotos } from './photos';
import { groupsFor, postItems, NOTHING_POSTED, type Author, type PostOutcome } from './autopost';
import { sweepExpiredPostImages } from './posts';
import { buildSharedSummary } from '../lib/groups';
import {
  calorieAvgPost, calorieWeekPost, loggingStreak, milestonePost, milestonesReached,
  photoPost, rulesPost, streakMilestone, streakPost, weightPost,
  type ItemKind, type PostItem,
} from '../lib/feed';
import { goalOn } from '../lib/goals';
import { estimateMaintenance } from '../lib/maintenance';
import { maintenanceBasis, paceSummary } from '../lib/pace';
import { addDays, startOfWeek, todayKey, toWeekKey, type DayKey } from '../lib/dates';
import { appliesOn, isMet } from '../lib/rules';
import { firstTrend, latestTrend, trendSeries } from '../lib/trend';
import { fromKg } from '../lib/units';
import type { DayLog, Exercise, Rule, UserProfile } from '../lib/types';
import type { ProgressPhoto } from './photos';

/** Far enough back to see a hundred-day streak, which is the longest we name. */
export const STREAK_LOOKBACK_DAYS = 101;
/** Enough for the maintenance window and the four-week trend. */
export const BASE_LOOKBACK_DAYS = 28;

export interface SyncInput {
  uid: string;
  author: Author;
  profile: UserProfile;
  memberships: Membership[];
}

interface Loaded {
  days: DayLog[];
  recent: DayLog[];
  rules: Rule[];
  exercises: Exercise[];
  photos: ProgressPhoto[];
}

/**
 * Everything the posting decisions need, in one round of reads.
 *
 * The streak window is only read when some group is actually listening for
 * one: a hundred small documents is nothing against the daily quota, but it
 * is not worth reading for somebody whose groups all have goals switched off.
 */
async function load(input: SyncInput, today: DayKey): Promise<Loaded> {
  const { uid, memberships } = input;
  const wantsGoals = memberships.some((membership) => membership.shareFlags?.goals);
  const wantsPhotos = memberships.some((membership) => membership.shareFlags?.photos);
  const lookback = wantsGoals ? STREAK_LOOKBACK_DAYS : BASE_LOOKBACK_DAYS;

  const [days, rules, exercises, photos] = await Promise.all([
    listDays(uid, addDays(today, -(lookback - 1)), today),
    listRules(uid),
    listExercises(uid),
    wantsPhotos ? listPhotos(uid, 8) : Promise.resolve([]),
  ]);

  return {
    days,
    // The mirror has always described the last four weeks, whatever was read.
    recent: days.filter((day) => day.date >= addDays(today, -(BASE_LOOKBACK_DAYS - 1))),
    rules,
    exercises,
    photos,
  };
}

/** Republishes what each group sees about this member. */
async function publishMirrors(
  input: SyncInput,
  data: Loaded,
  today: DayKey,
): Promise<void> {
  await Promise.all(
    input.memberships.map((membership) => {
      const flags = membership.shareFlags;
      if (!flags) return Promise.resolve();

      const summary = buildSharedSummary({
        uid: input.uid,
        displayName: input.author.name,
        flags,
        days: data.recent,
        today,
        targetCalories: input.profile.calorieTarget,
        goalHistory: input.profile.goalHistory ?? [],
        units: input.profile.units,
        rules: data.rules,
        exercises: data.exercises,
        photos: data.photos.map((photo) => ({ week: photo.week, thumbUrl: photo.thumbUrl })),
      });
      return publishShare(input.uid, membership.groupId, summary).catch(() => undefined);
    }),
  );
}

/** Where the week stands, which is what the two stats lines report. */
function weekPace(input: SyncInput, data: Loaded, today: DayKey) {
  const basis = maintenanceBasis(
    estimateMaintenance(data.recent, today),
    input.profile,
    latestTrend(trendSeries(data.recent)) ?? undefined,
  );
  return paceSummary({
    days: data.recent,
    start: startOfWeek(today),
    end: today,
    maintenanceCalories: basis.calories,
    targetCalories: input.profile.calorieTarget,
    goal: input.profile.goal,
  });
}

/**
 * The weekly report: the week's weight trend and its calorie average.
 *
 * Both describe the week just gone, so they are reported at the top of a new
 * one rather than updated every day. The ISO week they last went out for is
 * kept on each group's pointer, which is what makes "once a week" survive
 * the app being opened five times on Monday.
 */
export async function postWeeklyStats(input: SyncInput): Promise<PostOutcome> {
  const today = todayKey();
  const week = toWeekKey(today);

  const due = input.memberships.filter(
    (membership) =>
      membership.shareFlags?.stats === true && membership.lastStatsWeek !== week,
  );
  if (due.length === 0) return NOTHING_POSTED;

  const data = await load(input, today);
  const items: PostItem[] = [];

  // The week that has just ended is the one worth reporting on.
  const lastWeekStart = addDays(startOfWeek(today), -7);
  const lastWeekEnd = addDays(startOfWeek(today), -1);
  const lastWeek = data.recent.filter(
    (day) => day.date >= lastWeekStart && day.date <= lastWeekEnd,
  );

  const trend = trendSeries(lastWeek);
  const start = firstTrend(trend);
  const end = latestTrend(trend);
  if (start !== null && end !== null) {
    const spark = trend
      .map((point) => point.trendKg)
      .filter((value): value is number => value !== null)
      .map((kg) => Number(fromKg(kg, input.profile.units).toFixed(2)));
    items.push(weightPost(end - start, input.profile.units, spark));
  }

  const logged = lastWeek.filter((day) => day.calories > 0);
  if (logged.length > 0) {
    const total = logged.reduce((sum, day) => sum + day.calories, 0);
    items.push(
      calorieAvgPost(total / logged.length, input.profile.calorieTarget, logged.length),
    );
  }

  if (items.length === 0) return NOTHING_POSTED;

  const outcome = await postItems(input.memberships, input.author, today, items);
  await Promise.all(
    due.map((membership) =>
      recordAnnounced(input.uid, membership.groupId, { lastStatsWeek: week }),
    ),
  );
  return outcome;
}

/**
 * The achievements that logging can cross: a streak, a weight milestone, and
 * a week whose calorie goal has been met.
 *
 * Called the moment something is logged, because that is when any of them can
 * become true. All three persist once reached, so each group's pointer
 * records the highest already said.
 */
export async function postAchievements(input: SyncInput): Promise<PostOutcome> {
  const today = todayKey();
  if (groupsFor(input.memberships, 'streak').length === 0) return NOTHING_POSTED;

  const data = await load(input, today);
  const items: PostItem[] = [];
  const announce: { membership: Membership; patch: Record<string, unknown> }[] = [];

  // ---- A week whose calorie goal was met --------------------------------
  const pace = weekPace(input, data, today);
  const week = toWeekKey(today);
  const metWeek = pace.daysLogged >= 4 && pace.gapPerDay <= 0;
  const calorieDue = groupsFor(input.memberships, 'calorieWeek')
    .filter((membership) => membership.lastCalorieWeek !== week);

  if (metWeek && calorieDue.length > 0) {
    items.push(calorieWeekPost(pace.daysLogged));
    for (const membership of calorieDue) {
      announce.push({ membership, patch: { lastCalorieWeek: week } });
    }
  }

  // ---- A weight milestone toward the current goal -----------------------
  const latestKg = latestTrend(trendSeries(data.recent));
  if (latestKg !== null) {
    const period = goalOn(input.profile.goalHistory ?? [], today);
    const goal = period?.goal ?? input.profile.goal;
    const startWeightKg = period?.startWeightKg ?? input.profile.weightKg;
    const reached = milestonesReached(startWeightKg, latestKg, goal, input.profile.units);

    const behind = groupsFor(input.memberships, 'milestone')
      .filter((membership) => reached > (membership.lastMilestone ?? 0));

    if (reached > 0 && behind.length > 0) {
      items.push(milestonePost(reached, input.profile.units, goal));
      for (const membership of behind) {
        announce.push({ membership, patch: { lastMilestone: reached } });
      }
    }
  }

  // ---- A logging streak worth naming ------------------------------------
  const reachedStreak = streakMilestone(loggingStreak(data.days, today));
  const streakBehind = groupsFor(input.memberships, 'streak')
    .filter((membership) => reachedStreak > (membership.lastStreak ?? 0));

  if (reachedStreak > 0 && streakBehind.length > 0) {
    items.push(streakPost(reachedStreak));
    for (const membership of streakBehind) {
      announce.push({ membership, patch: { lastStreak: reachedStreak } });
    }
  }

  if (items.length === 0) return NOTHING_POSTED;

  const outcome = await postItems(input.memberships, input.author, today, items);
  await Promise.all(
    announce.map(({ membership, patch }) =>
      recordAnnounced(input.uid, membership.groupId, patch),
    ),
  );
  return outcome;
}

/**
 * Today's rules, if every one that applied was kept.
 *
 * Takes the rules and the day it has been handed rather than reading them
 * again: the screen that ticks the last box already has both, and this is
 * called the instant that happens.
 */
export async function postRulesKept(
  input: SyncInput,
  rules: Rule[],
  day: DayLog | undefined,
  today: DayKey = todayKey(),
): Promise<PostOutcome> {
  if (groupsFor(input.memberships, 'rules').length === 0) return NOTHING_POSTED;

  const due = rules.filter((rule) => rule.active && appliesOn(rule, today));
  const met = due.filter((rule) => isMet(rule, day?.rules?.[rule.id]));
  if (due.length === 0 || met.length !== due.length) return NOTHING_POSTED;

  return postItems(input.memberships, input.author, today, [rulesPost(due.length)]);
}

/** A progress photo, posted the moment it finishes uploading. */
export async function postPhoto(
  input: SyncInput,
  photo: { week: string; thumbUrl: string },
): Promise<PostOutcome> {
  if (groupsFor(input.memberships, 'photo').length === 0) return NOTHING_POSTED;
  return postItems(input.memberships, input.author, todayKey(), [
    photoPost(photo.week, photo.thumbUrl),
  ]);
}

export interface SyncOutcome extends PostOutcome {
  /** True when there was nothing to do, which is the usual case. */
  quiet: boolean;
}

/**
 * The whole job: refresh the mirrors, post the weekly report if a new week
 * has started, and catch any achievement whose immediate trigger was missed —
 * a tab closed mid-write, a flight-mode log, a second device.
 *
 * Idempotent throughout, which is what makes it safe to run on every app
 * open and from the Sync now button.
 */
export async function syncGroups(input: SyncInput): Promise<SyncOutcome> {
  const today = todayKey();
  if (input.memberships.length === 0) return { ...NOTHING_POSTED, quiet: true };

  const data = await load(input, today);
  await publishMirrors(input, data, today);

  const results: PostOutcome[] = [];
  results.push(await postWeeklyStats(input));
  results.push(await postAchievements(input));
  results.push(await postRulesKept(
    input,
    data.rules,
    data.recent.find((day) => day.date === today),
    today,
  ));

  // This week's photo, in case the upload happened while offline.
  const photo = data.photos.find((item) => item.week === toWeekKey(today));
  if (photo) {
    results.push(await postPhoto(input, { week: photo.week, thumbUrl: photo.thumbUrl }));
  }

  // Litter from posts the TTL policy has already removed.
  await sweepExpiredPostImages(input.uid).catch(() => undefined);

  const written = results.reduce((sum, result) => sum + result.written, 0);
  const failed = [...new Set(results.flatMap((result) => result.failed))];
  return { written, failed, quiet: written === 0 && failed.length === 0 };
}

/** The memberships a sync needs, for callers that do not already hold them. */
export async function loadMemberships(uid: string): Promise<Membership[]> {
  return listMyGroups(uid);
}

/** Which lines a category covers, for the sharing screen's pruning. */
export type { ItemKind };
