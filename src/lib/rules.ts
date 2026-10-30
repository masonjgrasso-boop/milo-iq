// Personal rules: evaluating them, and counting streaks.
//
// A rule a user set for themselves is theirs to break, so nothing here
// punishes. A streak counts what went well and a missed day simply ends it;
// there is no debt and no penalty carried forward.

import { addDays, startOfWeek, weekdayIndex, type DayKey } from './dates';
import type { DayLog, Rule } from './types';

export type DayStatus = 'met' | 'missed' | 'pending' | 'off';

/** Whether a rule is in force on a given date. */
export function appliesOn(rule: Rule, date: DayKey): boolean {
  if (!rule.active) return false;
  if (rule.daysOfWeek.length === 0) return true;
  return rule.daysOfWeek.includes(weekdayIndex(date));
}

/** Whether a recorded value satisfies a daily rule. */
export function isMet(rule: Rule, value: boolean | number | undefined): boolean {
  if (value === undefined) return false;
  if (rule.type === 'numeric') return Number(value) >= rule.target;
  return value === true;
}

/**
 * How a single day stands against a rule.
 *
 * Today is `pending` rather than `missed` until it is over — nobody should
 * open the app in the morning and be shown a failure.
 */
export function dayStatus(rule: Rule, day: DayLog, today: DayKey): DayStatus {
  if (!appliesOn(rule, day.date)) return 'off';
  const value = day.rules?.[rule.id];
  if (value === undefined) return day.date >= today ? 'pending' : 'missed';
  return isMet(rule, value) ? 'met' : 'missed';
}

/**
 * Consecutive applicable days met, counting back from today.
 *
 * Days the rule does not apply to are skipped rather than breaking the run,
 * so a weekday-only rule survives the weekend. An unfinished today neither
 * adds to the streak nor ends it.
 */
export function currentStreak(rule: Rule, days: DayLog[], today: DayKey): number {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const earliest = days.reduce<DayKey | null>(
    (min, day) => (min === null || day.date < min ? day.date : min),
    null,
  );
  if (earliest === null) return 0;

  let streak = 0;
  // Walk every calendar day backwards, not just the days we hold records for,
  // so a gap in the data correctly ends the streak instead of being skipped.
  for (let date = today; date >= earliest; date = addDays(date, -1)) {
    const day = byDate.get(date) ?? { date, calories: 0, entries: [] };
    const status = dayStatus(rule, day, today);
    if (status === 'off' || status === 'pending') continue;
    if (status === 'met') streak++;
    else break;
  }

  return streak;
}

export interface RuleWeekSummary {
  applicable: number;
  met: number;
  /** Percentage of applicable days met, 0 when the rule applied on no days. */
  percent: number;
}

/** How a daily rule went across a set of days. */
export function weekSummary(rule: Rule, days: DayLog[], today: DayKey): RuleWeekSummary {
  const statuses = days.map((day) => dayStatus(rule, day, today));
  // Pending days are not yet a success or a failure, so they are left out.
  const applicable = statuses.filter((status) => status === 'met' || status === 'missed').length;
  const met = statuses.filter((status) => status === 'met').length;
  return {
    applicable,
    met,
    percent: applicable === 0 ? 0 : Math.round((met / applicable) * 100),
  };
}

export interface WeeklyLimitStatus {
  /** Days this week the thing happened. */
  used: number;
  limit: number;
  withinLimit: boolean;
  remaining: number;
}

/** How a weekly-limit rule stands for the week containing `date`. */
export function weeklyLimitStatus(
  rule: Rule,
  days: DayLog[],
  date: DayKey,
): WeeklyLimitStatus {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const used = days.filter(
    (day) => day.date >= start && day.date <= end && day.rules?.[rule.id] === true,
  ).length;

  return {
    used,
    limit: rule.target,
    withinLimit: used <= rule.target,
    remaining: Math.max(0, rule.target - used),
  };
}

/** Consecutive past weeks a weekly-limit rule was respected, ending last week. */
export function weeklyLimitStreak(rule: Rule, days: DayLog[], today: DayKey): number {
  // The current week is still in progress, so the streak counts completed
  // weeks only.
  let streak = 0;
  let cursor = addDays(startOfWeek(today), -7);
  const earliest = days.reduce<DayKey | null>(
    (min, day) => (min === null || day.date < min ? day.date : min),
    null,
  );

  while (earliest !== null && cursor >= startOfWeek(earliest)) {
    if (weeklyLimitStatus(rule, days, cursor).withinLimit) streak++;
    else break;
    cursor = addDays(cursor, -7);
  }

  return streak;
}

export const RULE_TYPE_LABELS: Record<Rule['type'], string> = {
  boolean: 'Yes or no, each day',
  numeric: 'Hit a daily number',
  weeklyLimit: 'At most N days a week',
};
