import { describe, it, expect } from 'vitest';
import {
  toDayKey, fromDayKey, addDays, daysBetween, rangeKeys, lastNDays,
  toWeekKey, toMonthKey, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  weekdayIndex, weekdayLabel,
} from './dates';

describe('day keys', () => {
  it('formats a local date', () => {
    expect(toDayKey(new Date(2026, 2, 4))).toBe('2026-03-04');
    expect(toDayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips through a Date', () => {
    expect(toDayKey(fromDayKey('2026-07-19'))).toBe('2026-07-19');
  });

  it('uses local midnight, not UTC', () => {
    // A UTC-based implementation would shift this to the previous day for
    // anyone west of Greenwich.
    const parsed = fromDayKey('2026-03-04');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(4);
  });
});

describe('day arithmetic', () => {
  it('adds and subtracts days', () => {
    expect(addDays('2026-03-04', 1)).toBe('2026-03-05');
    expect(addDays('2026-03-04', -4)).toBe('2026-02-28');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-04')).toBe(3);
    expect(daysBetween('2026-03-04', '2026-03-01')).toBe(-3);
    expect(daysBetween('2026-03-04', '2026-03-04')).toBe(0);
  });

  it('spans a daylight-saving change without drifting', () => {
    // US DST begins 2026-03-08. A naive hours-based diff returns 6.958 here.
    expect(daysBetween('2026-03-05', '2026-03-12')).toBe(7);
  });
});

describe('ranges', () => {
  it('lists every day inclusive', () => {
    expect(rangeKeys('2026-03-01', '2026-03-04')).toEqual([
      '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04',
    ]);
  });

  it('returns a single day when from equals to', () => {
    expect(rangeKeys('2026-03-04', '2026-03-04')).toEqual(['2026-03-04']);
  });

  it('returns the last N days ending at the given day', () => {
    expect(lastNDays('2026-03-04', 3)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(lastNDays('2026-03-04', 1)).toEqual(['2026-03-04']);
    expect(lastNDays('2026-03-04', 28)).toHaveLength(28);
  });
});

describe('ISO weeks', () => {
  it('numbers a mid-year week', () => {
    // 2026-03-04 is a Wednesday in ISO week 10.
    expect(toWeekKey('2026-03-04')).toBe('2026-W10');
  });

  it('keeps a whole week in one bucket', () => {
    const keys = rangeKeys('2026-03-02', '2026-03-08').map(toWeekKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('2026-W10');
  });

  it('assigns a year-end week to the year holding its Thursday', () => {
    // 2027-01-01 is a Friday, so it belongs to 2026-W53.
    expect(toWeekKey('2027-01-01')).toBe('2026-W53');
    // 2026-01-01 is a Thursday, so it belongs to 2026-W01.
    expect(toWeekKey('2026-01-01')).toBe('2026-W01');
  });

  it('finds the Monday and Sunday of a week', () => {
    expect(startOfWeek('2026-03-04')).toBe('2026-03-02');
    expect(endOfWeek('2026-03-04')).toBe('2026-03-08');
    // A Sunday belongs to the week that started the previous Monday.
    expect(startOfWeek('2026-03-08')).toBe('2026-03-02');
  });
});

describe('months', () => {
  it('derives the month key', () => {
    expect(toMonthKey('2026-03-04')).toBe('2026-03');
  });

  it('finds the first and last day', () => {
    expect(startOfMonth('2026-03-04')).toBe('2026-03-01');
    expect(endOfMonth('2026-03-04')).toBe('2026-03-31');
    expect(endOfMonth('2026-04-15')).toBe('2026-04-30');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });
});

describe('weekdays', () => {
  it('indexes from Monday', () => {
    expect(weekdayIndex('2026-03-02')).toBe(0); // Monday
    expect(weekdayIndex('2026-03-08')).toBe(6); // Sunday
  });

  it('labels the day', () => {
    expect(weekdayLabel('2026-03-04')).toBe('Wed');
    expect(weekdayLabel('2026-03-08')).toBe('Sun');
  });
});
