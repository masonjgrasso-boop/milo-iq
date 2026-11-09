import { describe, it, expect } from 'vitest';
import {
  axisTicks, firstActiveIndex, weekKeysFor, sumDays, sumWeeks,
  BUCKET_FOR, RANGE_DAYS,
} from './deficit';
import { weekKeyToMonday as weekKeyToMondayFor } from './dates';
import type { DayLog, PeriodSummary } from './types';

const day = (date: string, calories: number): DayLog => ({ date, calories, entries: [] });

/** Only the fields the totals read. */
const week = (key: string, totalCalories: number, daysLogged: number): PeriodSummary => ({
  key,
  start: '2026-03-02',
  end: '2026-03-08',
  daysLogged,
  totalCalories,
  avgCalories: daysLogged === 0 ? 0 : Math.round(totalCalories / daysLogged),
  targetCalories: 2000,
  deficit: 0,
  weighIns: 0,
  firstWeightKg: null,
  lastWeightKg: null,
  avgWeightKg: null,
});

describe('ranges', () => {
  it('uses rolling periods, so a fresh month is never empty', () => {
    expect(RANGE_DAYS).toEqual({ month: 30, quarter: 90, year: 365 });
  });

  it('draws a point a day only for the month', () => {
    // Ninety daily points is a dense scribble at phone width.
    expect(BUCKET_FOR).toEqual({ month: 'day', quarter: 'week', year: 'week' });
  });
});

describe('weekKeysFor', () => {
  it('covers one whole ISO week for a seven-day span', () => {
    // 2026-03-02 is a Monday, 2026-03-08 the Sunday that closes its week.
    expect(weekKeysFor('2026-03-08', 7)).toEqual(['2026-W10']);
  });

  it('reaches back into the previous week when the span straddles one', () => {
    expect(weekKeysFor('2026-03-03', 7)).toEqual(['2026-W09', '2026-W10']);
  });

  it('covers a year in whole weeks', () => {
    expect(weekKeysFor('2026-03-08', 365)).toHaveLength(53);
  });

  it('ends on the week containing the end date', () => {
    const keys = weekKeysFor('2026-03-04', 365);
    expect(keys[keys.length - 1]).toBe('2026-W10');
  });
});

describe('totals', () => {
  it('counts only logged days', () => {
    expect(sumDays([day('2026-03-02', 2100), day('2026-03-03', 0)])).toEqual({
      totalCalories: 2100,
      daysLogged: 1,
    });
  });

  it('adds weekly roll-ups up', () => {
    expect(sumWeeks([week('2026-W09', 2300, 1), week('2026-W10', 12_600, 6)])).toEqual({
      totalCalories: 14_900,
      daysLogged: 7,
    });
  });
});

describe('firstActiveIndex', () => {
  it('finds where the data starts', () => {
    expect(firstActiveIndex([false, false, true, false, true])).toBe(2);
  });

  it('is zero when the first bucket already has something', () => {
    expect(firstActiveIndex([true, false])).toBe(0);
  });

  it('is zero when there is nothing at all, so nothing is trimmed away', () => {
    // The caller shows an empty state in this case rather than a chart.
    expect(firstActiveIndex([false, false])).toBe(0);
    expect(firstActiveIndex([])).toBe(0);
  });
});

describe('axisTicks', () => {
  const dates = (from: string, count: number): string[] => {
    const start = new Date(`${from}T00:00:00`);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  };

  it('labels about five days across a month', () => {
    const ticks = axisTicks(dates('2026-03-02', 30), 'day');
    expect(ticks).toHaveLength(30);
    expect(ticks.filter(Boolean)).toHaveLength(5);
  });

  it('spaces the day labels evenly', () => {
    const ticks = axisTicks(dates('2026-03-02', 30), 'day');
    const labelled = ticks.map((tick, index) => (tick ? index : -1)).filter((i) => i >= 0);
    expect(labelled).toEqual([0, 6, 12, 18, 24]);
  });

  it('labels every point on a chart trimmed back to a few days', () => {
    // Someone three days in gets three labels, not one and two blanks.
    const ticks = axisTicks(dates('2026-03-02', 3), 'day');
    expect(ticks.filter(Boolean)).toHaveLength(3);
  });

  it('labels only the start of each month across a year', () => {
    const mondays = weekKeysFor('2026-03-08', 365).map((key) => weekKeyToMondayFor(key));
    const ticks = axisTicks(mondays, 'week');
    // Twelve or thirteen month starts fall inside a 53-week span.
    const labels = ticks.filter(Boolean);
    expect(labels.length).toBeGreaterThanOrEqual(12);
    expect(labels.length).toBeLessThanOrEqual(13);
    // Month names only, never dates.
    expect(labels.every((label) => !/\d/.test(label))).toBe(true);
  });

  it('never labels two adjacent week buckets', () => {
    const ticks = axisTicks(
      weekKeysFor('2026-03-08', 365).map((key) => weekKeyToMondayFor(key)),
      'week',
    );
    // Two labels side by side is exactly how an axis gets crowded.
    const adjacent = ticks.some(
      (tick, index) => tick !== '' && index + 1 < ticks.length && ticks[index + 1] !== '',
    );
    expect(adjacent).toBe(false);
  });

  it('labels a three-month chart at its month starts', () => {
    const mondays = weekKeysFor('2026-03-08', 90).map((key) => weekKeyToMondayFor(key));
    const ticks = axisTicks(mondays, 'week');
    const labels = ticks.filter(Boolean);

    expect(ticks).toHaveLength(mondays.length);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.every((label) => !/\d/.test(label))).toBe(true);
  });

  it('falls back to dates when a short chart holds no month boundary', () => {
    // Three weeks inside one month would otherwise leave the axis blank.
    const ticks = axisTicks(['2026-03-09', '2026-03-16', '2026-03-23'], 'week');
    expect(ticks.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });
});
