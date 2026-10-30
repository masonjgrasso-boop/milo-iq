import { describe, it, expect } from 'vitest';
import { summarizeDays, summarizeWeek, summarizeMonth, isLogged } from './summaries';
import type { DayLog } from './types';

const day = (date: string, calories: number, weightKg?: number): DayLog => ({
  date, calories, entries: [], ...(weightKg === undefined ? {} : { weightKg }),
});

const week = { key: '2026-W10', start: '2026-03-02', end: '2026-03-08', targetCalories: 2000 };

describe('isLogged', () => {
  it('treats a day with calories as logged', () => {
    expect(isLogged(day('2026-03-02', 1800))).toBe(true);
  });

  it('treats an untouched day as not logged', () => {
    expect(isLogged(day('2026-03-02', 0))).toBe(false);
  });
});

describe('summarizeDays', () => {
  it('totals and averages only the logged days', () => {
    const summary = summarizeDays(
      [day('2026-03-02', 1800), day('2026-03-03', 2200), day('2026-03-04', 0)],
      week,
    );
    expect(summary.daysLogged).toBe(2);
    expect(summary.totalCalories).toBe(4000);
    expect(summary.avgCalories).toBe(2000);
  });

  it('measures the deficit against logged days only', () => {
    // Two days at target means no deficit, even though five days are missing.
    // A missed day must not look like a day of fasting.
    const summary = summarizeDays([day('2026-03-02', 2000), day('2026-03-03', 2000)], week);
    expect(summary.deficit).toBe(0);
  });

  it('reports a positive deficit when under target', () => {
    const summary = summarizeDays([day('2026-03-02', 1500), day('2026-03-03', 1700)], week);
    expect(summary.deficit).toBe(800); // (2000-1500) + (2000-1700)
  });

  it('reports a negative deficit when over target', () => {
    const summary = summarizeDays([day('2026-03-02', 2400)], week);
    expect(summary.deficit).toBe(-400);
  });

  it('returns an empty summary when nothing was logged', () => {
    const summary = summarizeDays([], week);
    expect(summary.daysLogged).toBe(0);
    expect(summary.avgCalories).toBe(0);
    expect(summary.deficit).toBe(0);
    expect(summary.avgWeightKg).toBeNull();
  });

  it('ignores days outside the range', () => {
    const summary = summarizeDays(
      [day('2026-03-01', 5000), day('2026-03-02', 2000), day('2026-03-09', 5000)],
      week,
    );
    expect(summary.daysLogged).toBe(1);
    expect(summary.totalCalories).toBe(2000);
  });

  it('tracks first, last and average weight in date order', () => {
    const summary = summarizeDays(
      [day('2026-03-04', 2000, 81), day('2026-03-02', 2000, 80), day('2026-03-06', 2000, 79)],
      week,
    );
    expect(summary.firstWeightKg).toBe(80);
    expect(summary.lastWeightKg).toBe(79);
    expect(summary.avgWeightKg).toBeCloseTo(80, 10);
    expect(summary.weighIns).toBe(3);
  });

  it('counts a weigh-in on an unlogged day', () => {
    // Stepping on the scale without logging food still records the weight.
    const summary = summarizeDays([day('2026-03-02', 0, 80)], week);
    expect(summary.daysLogged).toBe(0);
    expect(summary.weighIns).toBe(1);
    expect(summary.lastWeightKg).toBe(80);
  });
});

describe('summarizeWeek', () => {
  it('derives the Monday-to-Sunday range', () => {
    const summary = summarizeWeek([], '2026-W10', '2026-03-04', 2000);
    expect(summary.start).toBe('2026-03-02');
    expect(summary.end).toBe('2026-03-08');
  });
});

describe('summarizeMonth', () => {
  it('derives the first-to-last day range', () => {
    const summary = summarizeMonth([], '2026-03', '2026-03-04', 2000);
    expect(summary.start).toBe('2026-03-01');
    expect(summary.end).toBe('2026-03-31');
  });

  it('handles a short month', () => {
    expect(summarizeMonth([], '2026-02', '2026-02-10', 2000).end).toBe('2026-02-28');
  });
});
