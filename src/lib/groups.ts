// Groups, and deciding exactly what each member shares.
//
// Rather than filtering at read time, every member publishes a "mirror"
// document containing only the fields they have chosen to share. Anything
// unshared is never written to a readable location at all, so the security
// rule is a simple membership check and there is no way for a filtering bug
// to leak data that was never there.

import { currentStreak, weekSummary, weeklyLimitStatus, weeklyLimitStreak } from './rules';
import { summarizeDays } from './summaries';
import { firstTrend, latestTrend, trendSeries } from './trend';
import { startOfWeek, type DayKey, type WeekKey } from './dates';
import type { DayLog, Exercise, Rule, UnitSystem } from './types';

export type ShareKey = 'calories' | 'weight' | 'workouts' | 'rules' | 'photos';
export type ShareFlags = Record<ShareKey, boolean>;
export type GroupRole = 'coach' | 'member';

export const SHARE_KEYS: ShareKey[] = ['calories', 'weight', 'workouts', 'rules', 'photos'];

export const SHARE_LABELS: Record<ShareKey, string> = {
  calories: 'Calories',
  weight: 'Weight trend',
  workouts: 'Workouts',
  rules: 'Rules and streaks',
  photos: 'Progress photos',
};

export const SHARE_DESCRIPTIONS: Record<ShareKey, string> = {
  calories: 'Average intake, target and days logged this week',
  weight: 'Direction and size of your trend change, not your actual weight',
  workouts: 'Sessions this week and your best lifts',
  rules: 'Your rules and how your streaks are going',
  photos: 'Thumbnails of your weekly photos',
};

/** Nothing is shared until the member says so. */
export const NO_SHARING: ShareFlags = {
  calories: false,
  weight: false,
  workouts: false,
  rules: false,
  photos: false,
};

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
  target: number;
  daysLogged: number;
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
  units: UnitSystem;
  rules: Rule[];
  exercises: Exercise[];
  photos: SharedPhoto[];
}

/**
 * Assembles the mirror document.
 *
 * Weight is deliberately shared as a change rather than an absolute number:
 * what a group or coach needs is the direction of travel, and sharing the
 * figure on the scale is a far bigger ask than most people realise.
 */
export function buildSharedSummary(input: ShareInput): SharedSummary {
  const summary: SharedSummary = { uid: input.uid, displayName: input.displayName };
  const weekStart = startOfWeek(input.today);
  const thisWeek = input.days.filter((day) => day.date >= weekStart && day.date <= input.today);

  if (input.flags.calories) {
    const week = summarizeDays(thisWeek, {
      key: 'week',
      start: weekStart,
      end: input.today,
      targetCalories: input.targetCalories,
    });
    summary.calories = {
      avgIntake: week.avgCalories,
      target: input.targetCalories,
      daysLogged: week.daysLogged,
      deficit: week.deficit,
    };
  }

  if (input.flags.weight) {
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

  if (input.flags.workouts) {
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

  if (input.flags.rules) {
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

  return summary;
}
