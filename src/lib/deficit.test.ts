import { describe, it, expect } from 'vitest';
import {
  axisTicks, dailyDeficitPoints, firstActiveIndex, orientPoints, weeklyDeficitPoints,
  weekKeysFor, sumDays, sumWeeks,
  BUCKET_FOR, RANGE_DAYS, ROLLING_DAYS, ROLLING_LABELS, ROLLING_WEEKS,
} from './deficit';
import { weekdayLabel, weekKeyToMonday as weekKeyToMondayFor } from './dates';
import type { DayLog, PeriodSummary } from './types';

const day = (date: string, calories: number): DayLog => ({ date, calories, entries: [] });

/** Only the fields the deficit series reads. */
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

  it('draws a day at a time only for the month', () => {
    // Ninety daily bars would be about three pixels each on a phone.
    expect(BUCKET_FOR).toEqual({ month: 'day', quarter: 'week', year: 'week' });
  });

  it('names the averaging window it actually used', () => {
    expect(ROLLING_LABELS.day).toBe('7-day average');
    expect(ROLLING_LABELS.week).toBe('4-week average');
  });
});

describe('dailyDeficitPoints', () => {
  it('plots the deficit against maintenance, not against target', () => {
    const points = dailyDeficitPoints([day('2026-03-02', 2100)], 2500, weekdayLabel);
    expect(points[0].deficit).toBe(400);
  });

  it('goes negative on a day above maintenance', () => {
    const points = dailyDeficitPoints([day('2026-03-02', 3200)], 2500, weekdayLabel);
    expect(points[0].deficit).toBe(-700);
  });

  it('leaves an unlogged day as a gap, never as a zero', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-02', 2100), day('2026-03-03', 0)],
      2500,
      weekdayLabel,
    );
    expect(points[1].deficit).toBeNull();
    expect(points[1].daysLogged).toBe(0);
  });

  it('averages across logged days only', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-02', 2100), day('2026-03-03', 2300)],
      2500,
      weekdayLabel,
    );
    expect(points[0].rollingAvg).toBe(400);
    expect(points[1].rollingAvg).toBe(300); // (400 + 200) / 2
  });

  it('carries the average across a gap without resetting it', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-02', 2100), day('2026-03-03', 0), day('2026-03-04', 2100)],
      2500,
      weekdayLabel,
    );
    expect(points[1].rollingAvg).toBe(400); // unchanged by the missing day
    expect(points[2].rollingAvg).toBe(400);
  });

  it('has no average before the first logged day', () => {
    const points = dailyDeficitPoints([day('2026-03-02', 0)], 2500, weekdayLabel);
    expect(points[0].rollingAvg).toBeNull();
  });

  it('only looks back seven days, so the line follows recent behaviour', () => {
    // Seven days 500 below maintenance, then seven days right on it. A
    // cumulative average would still read 250 at the end; the point of the
    // rolling one is that it reads 0.
    const days = [
      ...Array.from({ length: 7 }, (_, i) => day(`2026-03-0${i + 2}`, 2000)),
      ...Array.from({ length: 7 }, (_, i) => day(`2026-03-${i + 9}`, 2500)),
    ];
    const points = dailyDeficitPoints(days, 2500, (date) => date);

    expect(points[6].rollingAvg).toBe(500);
    expect(points[13].rollingAvg).toBe(0);
  });

  it('drops a day out of the window once it is old enough', () => {
    const days = Array.from({ length: ROLLING_DAYS + 1 }, (_, i) =>
      day(`2026-03-${String(i + 2).padStart(2, '0')}`, i === 0 ? 1000 : 2500));
    const points = dailyDeficitPoints(days, 2500, (date) => date);

    // The 1,500 deficit on the first day is inside the window at index 7...
    expect(points[ROLLING_DAYS - 1].rollingAvg).toBeGreaterThan(0);
    // ...and gone by the next bar.
    expect(points[ROLLING_DAYS].rollingAvg).toBe(0);
  });

  it('sorts whatever order it is handed', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-04', 2000), day('2026-03-02', 2500)],
      2500,
      (date) => date,
    );
    expect(points.map((point) => point.label)).toEqual(['2026-03-02', '2026-03-04']);
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

describe('weeklyDeficitPoints', () => {
  it('averages across the days logged in the week', () => {
    const points = weeklyDeficitPoints(['2026-W10'], [week('2026-W10', 10_500, 5)], 2500);
    expect(points[0].deficit).toBe(400); // 2500 - 2100
  });

  it('leaves a week with no summary as a gap', () => {
    const points = weeklyDeficitPoints(
      ['2026-W09', '2026-W10'],
      [week('2026-W10', 10_500, 5)],
      2500,
    );
    expect(points[0].deficit).toBeNull();
    expect(points[1].deficit).toBe(400);
  });

  it('weights the rolling average by days logged, not by weeks', () => {
    const points = weeklyDeficitPoints(
      ['2026-W09', '2026-W10'],
      [week('2026-W09', 2300, 1), week('2026-W10', 12_600, 6)],
      2500,
    );
    // One day 200 below, six days 400 below: (200 + 2400) / 7 = 371.
    expect(points[0].rollingAvg).toBe(200);
    expect(points[1].rollingAvg).toBe(371);
  });

  it('looks back four weeks rather than seven days', () => {
    const keys = Array.from({ length: 6 }, (_, i) => `2026-W0${i + 4}`);
    const summaries = keys.map((key, index) =>
      week(key, index === 0 ? 14_000 : 17_500, 7));
    const points = weeklyDeficitPoints(keys, summaries, 2500);

    // The first week ran a 500 deficit; the rest sat on maintenance. It is
    // inside the four-week window at index 3 and outside it at index 4.
    expect(points[ROLLING_WEEKS - 1].rollingAvg).toBeGreaterThan(0);
    expect(points[ROLLING_WEEKS].rollingAvg).toBe(0);
  });

  it('labels a week by its Monday', () => {
    const points = weeklyDeficitPoints(['2026-W10'], [], 2500);
    expect(points[0].label).toBe(new Date(2026, 2, 2).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    }));
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

describe('orientPoints', () => {
  const points = dailyDeficitPoints(
    [day('2026-03-02', 2000), day('2026-03-03', 3000)],
    2500,
    (date) => date,
  );

  it('leaves a lose goal alone, where a deficit is already up', () => {
    expect(orientPoints(points, 'lose')).toEqual(points);
    expect(orientPoints(points, 'maintain')).toEqual(points);
  });

  it('turns a gain goal round, so a surplus plots upward', () => {
    const gaining = orientPoints(points, 'gain');
    // Eating 500 under maintenance is the bad day for someone gaining.
    expect(gaining[0].deficit).toBe(-500);
    // And 500 over it is the good one.
    expect(gaining[1].deficit).toBe(500);
  });

  it('turns the average round with the bars, never half of it', () => {
    const gaining = orientPoints(points, 'gain');
    expect(gaining[0].rollingAvg).toBe(-500);
    expect(gaining[1].rollingAvg).toBe(0);
  });

  it('keeps a gap a gap', () => {
    const withGap = dailyDeficitPoints([day('2026-03-02', 0)], 2500, (date) => date);
    const gaining = orientPoints(withGap, 'gain');
    expect(gaining[0].deficit).toBeNull();
    expect(gaining[0].rollingAvg).toBeNull();
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

  it('spaces the month labels evenly', () => {
    const ticks = axisTicks(dates('2026-03-02', 30), 'day');
    const labelled = ticks.map((tick, index) => (tick ? index : -1)).filter((i) => i >= 0);
    expect(labelled).toEqual([0, 6, 12, 18, 24]);
  });

  it('labels every bar on a chart trimmed back to a few days', () => {
    // Someone three days in gets three labels, not one and two blanks.
    const ticks = axisTicks(dates('2026-03-02', 3), 'day');
    expect(ticks.filter(Boolean)).toHaveLength(3);
  });

  it('labels only the start of each month across a year', () => {
    const mondays = weekKeysFor('2026-03-08', 365).map((key) => key);
    const ticks = axisTicks(
      mondays.map((key) => weekKeyToMondayFor(key)),
      'week',
    );
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
