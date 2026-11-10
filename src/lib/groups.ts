// Groups, and deciding exactly what each member shares.
//
// Rather than filtering at read time, every member publishes a "mirror"
// document containing only the fields they have chosen to share. Anything
// unshared is never written to a readable location at all, so the security
// rule is a simple membership check and there is no way for a filtering bug
// to leak data that was never there.

import { blendedTarget } from './goals';
import { currentStreak, weekSummary, weeklyLimitStatus, weeklyLimitStreak } from './rules';
import { summarizeDays } from './summaries';
import { firstTrend, latestTrend, trendSeries } from './trend';
import { daysBetween, startOfWeek, type DayKey, type WeekKey } from './dates';
import type { DayLog, Exercise, GoalPeriod, Rule, UnitSystem } from './types';

/**
 * What a member can share with a group.
 *
 * Three things somebody would actually think of as a decision, plus the
 * inactivity switch. The older model had one flag per section of the mirror,
 * which meant six checkboxes to answer a question nobody asks in six parts.
 */
export type ShareKey = 'stats' | 'goals' | 'photos' | 'activity';
export type ShareFlags = Record<ShareKey, boolean>;

/**
 * One admin per group, everyone else a member.
 *
 * This replaces the old coach/client split. A coach was a role the app gave
 * special sight of other people's data; an admin is only a caretaker of the
 * group itself, and sees exactly what every other member sees.
 */
export type GroupRole = 'admin' | 'member';

export const SHARE_KEYS: ShareKey[] = ['stats', 'goals', 'photos', 'activity'];

/** The three asked about before somebody joins. */
export const JOIN_SHARE_KEYS: ShareKey[] = ['stats', 'goals', 'photos'];

export const SHARE_LABELS: Record<ShareKey, string> = {
  stats: 'Stats',
  goals: 'Goals hit',
  photos: 'Progress photos',
  activity: 'Show when I am inactive',
};

export const SHARE_DESCRIPTIONS: Record<ShareKey, string> = {
  stats: 'Your weight trend and your calorie average for the week',
  goals: 'Rules kept, workouts, calorie goals, milestones and streaks',
  photos: 'Thumbnails of your weekly photos',
  activity: 'Lets the group see a gap in your logging, and nudge you',
};

/** Nothing is shared until the member says so. */
export const NO_SHARING: ShareFlags = {
  stats: false,
  goals: false,
  photos: false,
  activity: false,
};

/**
 * What a new member starts with.
 *
 * Everything substantive is off, as it always has been. The exception is the
 * inactivity flag, which is on: it shares no data at all, only the fact that
 * a gap exists, and a group whose members cannot see a gap cannot do the one
 * thing an accountability group is for. It is a single tap to turn off, and
 * the sharing screen says what it does.
 */
export const DEFAULT_SHARING: ShareFlags = { ...NO_SHARING, activity: true };

/**
 * Reads whatever is stored on a member record, old shape or new.
 *
 * The first version of sharing had a flag per section: calories, weight,
 * workouts, rules, photos. Anyone who was already in a group has those on
 * their record, and they were deliberate choices, so they are folded into
 * the three rather than reset. Sharing either number gives stats; sharing
 * either achievement gives goals.
 *
 * Inactivity defaults on for an older record that has no opinion about it,
 * which matches what a new member gets.
 */
export function migrateShareFlags(raw: unknown): ShareFlags {
  const stored = (raw ?? {}) as Partial<Record<string, boolean>>;

  // "photos" means the same thing in both shapes, so its presence proves
  // nothing. What identifies an old record is a key only the old shape had.
  const OLD_ONLY = ['calories', 'weight', 'workouts', 'rules'];
  const isOld = OLD_ONLY.some((key) => key in stored);
  if (!isOld) {
    return {
      stats: stored.stats === true,
      goals: stored.goals === true,
      photos: stored.photos === true,
      activity: stored.activity !== false,
    };
  }

  return {
    stats: stored.calories === true || stored.weight === true,
    goals: stored.workouts === true || stored.rules === true,
    photos: stored.photos === true,
    activity: stored.activity !== false,
  };
}

/** A member who has not logged for this long shows as inactive to the group. */
export const INACTIVE_AFTER_DAYS = 3;

/** Whether a member's last logged day is far enough back to mention. */
export function daysInactive(lastLoggedDay: DayKey | undefined, today: DayKey): number {
  if (!lastLoggedDay) return 0;
  return Math.max(0, daysBetween(lastLoggedDay, today));
}

export function isInactive(lastLoggedDay: DayKey | undefined, today: DayKey): boolean {
  return daysInactive(lastLoggedDay, today) >= INACTIVE_AFTER_DAYS;
}

// Characters that cannot be confused for one another when read aloud or
// typed: no O/0, no I/1.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;

export function generateInviteCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidInviteCode(input: string): boolean {
  const code = normalizeInviteCode(input);
  return (
    code.length === INVITE_CODE_LENGTH &&
    [...code].every((character) => CODE_ALPHABET.includes(character))
  );
}

export interface SharedCalories {
  avgIntake: number;
  /** The target in force today, which is the one worth showing. */
  target: number;
  daysLogged: number;
  /**
   * Positive means under target across the logged days.
   *
   * Measured against the target that was actually in force on each of those
   * days, not against today's. A week in which the member switched from
   * losing to gaining is scored partly against each, exactly as Trends does
   * it, so a group never sees someone's old deficit days counted as a failure
   * to gain.
   */
  deficit: number;
}

export interface SharedWeight {
  /** Change in trend weight over the period, in kg. Never an absolute weight. */
  changeKg: number;
  units: UnitSystem;
}

export interface SharedWorkouts {
  sessionsThisWeek: number;
  lastDate?: DayKey;
  topLifts: { name: string; e1rmKg: number }[];
}

export interface SharedRule {
  name: string;
  streak: number;
  detail: string;
}

export interface SharedPhoto {
  week: WeekKey;
  thumbUrl: string;
}

/**
 * What one member shares with one group. Every section is optional and is
 * omitted entirely — not set to null — when its flag is off.
 */
export interface SharedSummary {
  uid: string;
  displayName: string;
  /** The last day anything was logged, shared only with the activity flag. */
  lastLoggedDay?: DayKey;
  updatedAt?: unknown;
  calories?: SharedCalories;
  weight?: SharedWeight;
  workouts?: SharedWorkouts;
  rules?: SharedRule[];
  photos?: SharedPhoto[];
}

export interface ShareInput {
  uid: string;
  displayName: string;
  flags: ShareFlags;
  days: DayLog[];
  today: DayKey;
  targetCalories: number;
  /**
   * Every goal the member has held, so a week spanning a change scores right.
   * Optional because the profile field is: somebody who has never changed
   * goals has no history, and one target applies to the whole week.
   */
  goalHistory?: GoalPeriod[];
  units: UnitSystem;
  rules: Rule[];
  exercises: Exercise[];
  photos: SharedPhoto[];
}

/**
 * Assembles the mirror document.
 *
 * Weight is deliberately shared as a change rather than an absolute number:
 * what a group needs is the direction of travel, and sharing the
 * figure on the scale is a far bigger ask than most people realise.
 */
export function buildSharedSummary(input: ShareInput): SharedSummary {
  const summary: SharedSummary = { uid: input.uid, displayName: input.displayName };
  const weekStart = startOfWeek(input.today);
  const thisWeek = input.days.filter((day) => day.date >= weekStart && day.date <= input.today);

  if (input.flags.stats) {
    // Blended across any goal change inside the week, so each logged day is
    // judged against the goal that was active on it. Only the logged days
    // count towards the blend, because only they are scored.
    const target = blendedTarget(
      thisWeek.filter((day) => day.calories > 0).map((day) => day.date),
      input.goalHistory ?? [],
      input.targetCalories,
    );
    const week = summarizeDays(thisWeek, {
      key: 'week',
      start: weekStart,
      end: input.today,
      targetCalories: target,
    });
    summary.calories = {
      avgIntake: week.avgCalories,
      // The figure on screen is today's target; the deficit above is what the
      // week was really measured against.
      target: input.targetCalories,
      daysLogged: week.daysLogged,
      deficit: week.deficit,
    };
  }

  if (input.flags.stats) {
    const points = trendSeries(input.days);
    const start = firstTrend(points);
    const end = latestTrend(points);
    if (start !== null && end !== null) {
      summary.weight = {
        changeKg: Number((end - start).toFixed(2)),
        units: input.units,
      };
    }
  }

  if (input.flags.goals) {
    const topLifts = input.exercises
      .filter((exercise) => (exercise.bestE1rmKg ?? 0) > 0)
      .sort((a, b) => (b.bestE1rmKg ?? 0) - (a.bestE1rmKg ?? 0))
      .slice(0, 3)
      .map((exercise) => ({
        name: exercise.name,
        e1rmKg: Number((exercise.bestE1rmKg ?? 0).toFixed(1)),
      }));

    const lastDates = input.exercises
      .map((exercise) => exercise.lastDate)
      .filter((date): date is DayKey => date !== undefined)
      .sort();

    summary.workouts = {
      sessionsThisWeek: lastDates.filter((date) => date >= weekStart).length,
      ...(lastDates.length > 0 ? { lastDate: lastDates[lastDates.length - 1] } : {}),
      topLifts,
    };
  }

  if (input.flags.goals) {
    summary.rules = input.rules
      .filter((rule) => rule.active)
      .map((rule) => {
        if (rule.type === 'weeklyLimit') {
          const status = weeklyLimitStatus(rule, thisWeek, input.today);
          return {
            name: rule.name,
            streak: weeklyLimitStreak(rule, input.days, input.today),
            detail: `${status.used} of ${status.limit} used this week`,
          };
        }
        const week = weekSummary(rule, thisWeek, input.today);
        return {
          name: rule.name,
          streak: currentStreak(rule, input.days, input.today),
          detail:
            week.applicable === 0
              ? 'Nothing due yet this week'
              : `${week.met} of ${week.applicable} days this week`,
        };
      });
  }

  if (input.flags.photos) {
    summary.photos = input.photos.slice(0, 8);
  }

  if (input.flags.activity) {
    // A date, not a count: the group reads it against its own clock, so a
    // member who stops opening the app still shows the gap growing.
    const logged = input.days.filter((day) => day.calories > 0).map((day) => day.date).sort();
    if (logged.length > 0) summary.lastLoggedDay = logged[logged.length - 1];
  }

  return summary;
}
