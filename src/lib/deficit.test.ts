import { describe, it, expect } from 'vitest';
import {
  dailyDeficitPoints, weeklyDeficitPoints, weekKeysFor, sumDays, sumWeeks,
  RANGE_DAYS,
} from './deficit';
import { weekdayLabel } from './dates';
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

describe('RANGE_DAYS', () => {
  it('uses rolling periods, so a fresh month is never empty', () => {
    expect(RANGE_DAYS).toEqual({ week: 7, month: 30, year: 365 });
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

  it('runs the average across logged days only', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-02', 2100), day('2026-03-03', 2300)],
      2500,
      weekdayLabel,
    );
    expect(points[0].runningAvg).toBe(400);
    expect(points[1].runningAvg).toBe(300); // (400 + 200) / 2
  });

  it('holds the running average steady across a gap', () => {
    const points = dailyDeficitPoints(
      [day('2026-03-02', 2100), day('2026-03-03', 0), day('2026-03-04', 2100)],
      2500,
      weekdayLabel,
    );
    expect(points[1].runningAvg).toBe(400); // unchanged by the missing day
    expect(points[2].runningAvg).toBe(400);
  });

  it('has no average before the first logged day', () => {
    const points = dailyDeficitPoints([day('2026-03-02', 0)], 2500, weekdayLabel);
    expect(points[0].runningAvg).toBeNull();
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

  it('weights the running average by days logged, not by weeks', () => {
    const points = weeklyDeficitPoints(
      ['2026-W09', '2026-W10'],
      [week('2026-W09', 2300, 1), week('2026-W10', 12_600, 6)],
      2500,
    );
    // One day 200 below, six days 400 below: (200 + 2400) / 7 = 371.
    expect(points[0].runningAvg).toBe(200);
    expect(points[1].runningAvg).toBe(371);
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
