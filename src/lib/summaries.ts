// Rolling up day logs into week and month summaries.
//
// These are stored as their own documents so that dashboards, the maintenance
// estimate and group sharing can read one small doc instead of re-reading
// every raw day log.

import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, type DayKey } from './dates';
import type { DayLog, PeriodSummary } from './types';

/** A day only counts as logged once something was actually eaten. */
export const isLogged = (day: DayLog): boolean => day.calories > 0;

export interface SummaryInput {
  key: string;
  start: DayKey;
  end: DayKey;
  targetCalories: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeDays(days: DayLog[], input: SummaryInput): PeriodSummary {
  const inRange = days
    .filter((day) => day.date >= input.start && day.date <= input.end)
    .sort((a, b) => a.date.localeCompare(b.date));

  const logged = inRange.filter(isLogged);
  const totalCalories = logged.reduce((sum, day) => sum + day.calories, 0);

  const weights = inRange
    .filter((day) => typeof day.weightKg === 'number')
    .map((day) => day.weightKg as number);

  return {
    key: input.key,
    start: input.start,
    end: input.end,
    daysLogged: logged.length,
    totalCalories,
    avgCalories: logged.length === 0 ? 0 : Math.round(totalCalories / logged.length),
    targetCalories: input.targetCalories,
    // Positive means under target overall. Only logged days count, so a day
    // you forgot does not masquerade as a day you fasted.
    deficit: logged.length * input.targetCalories - totalCalories,
    weighIns: weights.length,
    firstWeightKg: weights[0] ?? null,
    lastWeightKg: weights[weights.length - 1] ?? null,
    avgWeightKg: average(weights),
  };
}

export function summarizeWeek(
  days: DayLog[],
  weekKey: string,
  anyDayInWeek: DayKey,
  targetCalories: number,
): PeriodSummary {
  return summarizeDays(days, {
    key: weekKey,
    start: startOfWeek(anyDayInWeek),
    end: endOfWeek(anyDayInWeek),
    targetCalories,
  });
}

export function summarizeMonth(
  days: DayLog[],
  monthKey: string,
  anyDayInMonth: DayKey,
  targetCalories: number,
): PeriodSummary {
  return summarizeDays(days, {
    key: monthKey,
    start: startOfMonth(anyDayInMonth),
    end: endOfMonth(anyDayInMonth),
    targetCalories,
  });
}
