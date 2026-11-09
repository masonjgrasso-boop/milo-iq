// Goal history: what you were aiming for, and when.
//
// A goal is not a permanent fact about someone. People switch from losing fat
// to building muscle, and when they do, the days they already logged must not
// be re-scored against the new aim — a month of honest deficit days is not a
// failure to gain weight. So every goal is stored with the day it started,
// and each past day is judged against the goal that was active on it.
//
// Nothing here writes anything or deletes anything. Past logs are never
// touched; only the yardstick they are measured with changes.

import type { DayKey } from './dates';
import type { Goal, GoalPeriod } from './types';

/** Oldest first. A stable sort, so same-day entries keep their order. */
export function sortGoals(history: GoalPeriod[]): GoalPeriod[] {
  return [...history].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * The goal in force on a given day, or null when there is no history at all.
 *
 * A day earlier than every entry resolves to the earliest one. History has to
 * begin somewhere, and the alternative — "no goal applies" — would leave the
 * oldest logs unjudgeable. It also means the first entry's own start date is
 * cosmetic: anything before it lands on it anyway.
 */
export function goalOn(history: GoalPeriod[], date: DayKey): GoalPeriod | null {
  const sorted = sortGoals(history);
  if (sorted.length === 0) return null;

  let active = sorted[0];
  for (const period of sorted) {
    if (period.startDate > date) break;
    active = period;
  }
  return active;
}

/** The daily calorie target that applied on a day, or `fallback` with no history. */
export function targetOn(history: GoalPeriod[], date: DayKey, fallback: number): number {
  return goalOn(history, date)?.calorieTarget ?? fallback;
}

/**
 * The single daily target to measure a span of days against.
 *
 * Averaged across the days handed in, so a period straddling a goal change is
 * scored partly against each. Everything downstream — the gap, the status, the
 * catch-up plan — then works off one number without needing to know that the
 * goal moved part-way through.
 */
export function blendedTarget(
  dates: DayKey[],
  history: GoalPeriod[],
  fallback: number,
): number {
  if (dates.length === 0) return fallback;
  const total = dates.reduce((sum, date) => sum + targetOn(history, date, fallback), 0);
  return Math.round(total / dates.length);
}

/**
 * Which buckets on a chart a goal change falls in, as indices.
 *
 * `bucketStarts` is the first day each bar covers — a day in the week and
 * month views, a Monday in the year view — so a change mid-week marks that
 * week. The earliest entry is never a change: it is where the history starts.
 * Changes before the chart's own window are left out.
 */
export function goalChangeIndices(
  bucketStarts: DayKey[],
  history: GoalPeriod[],
): number[] {
  const sorted = sortGoals(history);
  if (bucketStarts.length === 0 || sorted.length < 2) return [];

  const found = new Set<number>();
  for (const period of sorted.slice(1)) {
    if (period.startDate < bucketStarts[0]) continue;

    let index = -1;
    for (let i = 0; i < bucketStarts.length; i++) {
      if (bucketStarts[i] <= period.startDate) index = i;
    }
    if (index >= 0) found.add(index);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Adds an entry, replacing one that already starts on the same day.
 *
 * Changing your mind twice in an afternoon should leave one goal for today,
 * not two — and two entries sharing a start date would make "the goal active
 * that day" ambiguous.
 */
export function appendGoalPeriod(history: GoalPeriod[], entry: GoalPeriod): GoalPeriod[] {
  const kept = history.filter((period) => period.startDate !== entry.startDate);
  return sortGoals([...kept, entry]);
}

/**
 * The history to store when a goal changes.
 *
 * Someone changing goals for the first time has no history, so the goal they
 * are leaving is written down too. Without that, every day they have already
 * logged would fall through to the new goal and be scored against an aim they
 * did not have at the time.
 */
export function recordGoalChange({ history, previous, next }: {
  history: GoalPeriod[];
  /** The goal being left, seeded only when the history is empty. */
  previous: GoalPeriod;
  /** The new goal, starting the day it was saved. */
  next: GoalPeriod;
}): GoalPeriod[] {
  const seeded = history.length === 0 ? [previous] : history;
  return appendGoalPeriod(seeded, next);
}

/** True when the two goals differ in any way worth recording. */
export function goalsDiffer(a: Omit<GoalPeriod, 'startDate'>, b: Omit<GoalPeriod, 'startDate'>): boolean {
  return (
    a.goal !== b.goal ||
    a.calorieTarget !== b.calorieTarget ||
    Math.abs(a.targetRateKgPerWeek - b.targetRateKgPerWeek) > 0.0001
  );
}

/**
 * The words each goal uses, in one place.
 *
 * Every screen that says "deficit" has to say "surplus" for someone gaining,
 * and the direction a shortfall is fixed in flips with it. Keeping the
 * vocabulary here is what stops one screen from switching and another not.
 */
export interface GoalVocabulary {
  /** What the daily gap between maintenance and target is called. */
  gap: string;
  /** Which side of maintenance the goal sits on. */
  side: 'below' | 'above' | 'at';
  /** Which way being short of the plan is put right. */
  fix: 'eat-less' | 'eat-more';
  /** The goal in a few words, for a heading or a summary row. */
  label: string;
  /** The verb, for sentences like "how much to lose". */
  verb: string;
  /** What the deficit chart is measuring, as its heading. */
  chart: string;
  /** A single bar going the wrong way, for the note under that chart. */
  offDay: string;
  /**
   * What a bar above the zero line is called, and what one below it is.
   *
   * The chart is oriented so that up is always the way the goal wants to go,
   * which means these two swap meaning between goals rather than the colours
   * doing it: for someone losing, up is a deficit; for someone gaining, up is
   * a surplus and down is having eaten under maintenance.
   */
  above: string;
  below: string;
}

export const GOAL_WORDS: Record<Goal, GoalVocabulary> = {
  lose: {
    gap: 'deficit',
    side: 'below',
    fix: 'eat-less',
    label: 'Losing weight',
    verb: 'lose',
    chart: 'Daily deficit',
    offDay: 'An over day',
    above: 'Deficit',
    below: 'Over',
  },
  maintain: {
    gap: 'balance',
    side: 'at',
    fix: 'eat-less',
    label: 'Maintaining',
    verb: 'maintain',
    chart: 'Against maintenance',
    offDay: 'An off day',
    above: 'Under maintenance',
    below: 'Over',
  },
  gain: {
    gap: 'surplus',
    side: 'above',
    fix: 'eat-more',
    label: 'Gaining weight',
    verb: 'gain',
    chart: 'Daily surplus',
    offDay: 'A light day',
    above: 'Surplus',
    below: 'Under maintenance',
  },
};

/**
 * The label for the figure a goal asks for each day.
 *
 * "Goal balance" would be an odd thing to read, so maintaining gets its own
 * wording rather than being composed from `gap`.
 */
export const GOAL_GAP_LABEL: Record<Goal, string> = {
  lose: 'Goal deficit',
  maintain: 'Goal',
  gain: 'Goal surplus',
};

/**
 * How far the average has moved in the goal's own direction, as a positive
 * number when it is the right way.
 *
 * Takes the deficit-signed figure: for someone gaining, a surplus shows up
 * negative, and a screen that printed it raw would tell them they are 400
 * behind when they are 400 ahead.
 */
export function progressToward(goal: Goal, deficitPerDay: number): number {
  if (goal !== 'gain') return deficitPerDay;
  // Negating an exact zero yields -0, which compares unequal to 0 under
  // Object.is and can print with a stray minus on a chart axis.
  return deficitPerDay === 0 ? 0 : -deficitPerDay;
}

/**
 * "250 below maintenance", in the app's one voice.
 *
 * Takes the deficit-signed figure every calculation in here produces, where
 * positive means below maintenance, and says which side of it that is. The
 * caller supplies the sentence around it.
 */
export function describeAverage(deficitPerDay: number): string {
  const rounded = Math.round(deficitPerDay);
  if (rounded === 0) return 'right at maintenance';
  const amount = Math.abs(rounded).toLocaleString();
  return rounded > 0 ? `${amount} below maintenance` : `${amount} above maintenance`;
}
