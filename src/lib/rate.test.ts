import { describe, it, expect } from 'vitest';
import {
  AGGRESSIVE_WEEKLY_SHARE, WEEKS_PER_MONTH, gentlerRate, rateConcern, rateToKgPerWeek,
  safeMinimum, weeklyShareOfBodyWeight,
} from './rate';
import { lbToKg } from './units';

describe('rateToKgPerWeek', () => {
  it('passes a metric weekly rate straight through', () => {
    expect(rateToKgPerWeek(0.5, 'week', 'metric')).toBeCloseTo(0.5, 10);
  });

  it('converts pounds a week to kilos a week', () => {
    expect(rateToKgPerWeek(1, 'week', 'imperial')).toBeCloseTo(lbToKg(1), 10);
  });

  it('spreads a monthly rate across the weeks in a month', () => {
    expect(rateToKgPerWeek(4, 'month', 'metric')).toBeCloseTo(4 / WEEKS_PER_MONTH, 10);
  });

  it('converts units and period together', () => {
    expect(rateToKgPerWeek(8, 'month', 'imperial'))
      .toBeCloseTo(lbToKg(8) / WEEKS_PER_MONTH, 10);
  });

  it('treats a month as a little over four weeks, not exactly four', () => {
    expect(WEEKS_PER_MONTH).toBeGreaterThan(4);
    expect(WEEKS_PER_MONTH).toBeLessThan(4.5);
  });

  it('reads an empty or half-typed field as no rate', () => {
    expect(rateToKgPerWeek(Number.NaN, 'week', 'metric')).toBe(0);
    expect(rateToKgPerWeek(0, 'week', 'metric')).toBe(0);
    expect(rateToKgPerWeek(-2, 'week', 'metric')).toBe(0);
    expect(rateToKgPerWeek(Number.POSITIVE_INFINITY, 'week', 'metric')).toBe(0);
  });
});

describe('weeklyShareOfBodyWeight', () => {
  it('is the rate over the weight', () => {
    expect(weeklyShareOfBodyWeight(0.9, 90)).toBeCloseTo(0.01, 10);
  });

  it('does not divide by a missing weight', () => {
    expect(weeklyShareOfBodyWeight(1, 0)).toBe(0);
  });
});

describe('rateConcern', () => {
  const base = { weightKg: 90, clampedToFloor: false };

  it('says nothing about a sensible rate', () => {
    expect(rateConcern({ ...base, rateKgPerWeek: 0.5 })).toBe('none');
  });

  it('says nothing when no rate has been entered', () => {
    expect(rateConcern({ ...base, rateKgPerWeek: 0 })).toBe('none');
  });

  it('flags a rate that lands exactly on the one percent line as fine', () => {
    // On the line is allowed; past it is not.
    expect(rateConcern({ ...base, rateKgPerWeek: 90 * AGGRESSIVE_WEEKLY_SHARE })).toBe('none');
  });

  it('flags a rate past one percent of body weight', () => {
    expect(rateConcern({ ...base, rateKgPerWeek: 1.2 })).toBe('aggressive');
  });

  it('scales with body weight, so the same rate differs by person', () => {
    expect(rateConcern({ weightKg: 120, clampedToFloor: false, rateKgPerWeek: 1.1 })).toBe('none');
    expect(rateConcern({ weightKg: 60, clampedToFloor: false, rateKgPerWeek: 1.1 }))
      .toBe('aggressive');
  });

  it('puts being pushed under the floor ahead of merely being fast', () => {
    expect(rateConcern({ weightKg: 60, clampedToFloor: true, rateKgPerWeek: 1.5 }))
      .toBe('below-minimum');
  });
});

describe('safeMinimum', () => {
  it('is the published floor for each', () => {
    expect(safeMinimum('male')).toBe(1500);
    expect(safeMinimum('female')).toBe(1200);
  });
});

describe('gentlerRate', () => {
  it('suggests one percent of body weight a week', () => {
    expect(gentlerRate(90, 'week', 'metric')).toBeCloseTo(0.9, 5);
  });

  it('suggests it per month when that is how it was asked', () => {
    expect(gentlerRate(90, 'month', 'metric')).toBeCloseTo(
      Math.round(0.9 * WEEKS_PER_MONTH * 10) / 10,
      5,
    );
  });

  it('answers in pounds for someone using pounds', () => {
    // 90kg is about 198lb, so one percent a week is about 2lb.
    expect(gentlerRate(90, 'week', 'imperial')).toBeCloseTo(2, 1);
  });

  it('is a figure someone would actually type', () => {
    const value = gentlerRate(83.4, 'week', 'imperial');
    expect(value).toBe(Math.round(value * 10) / 10);
  });

  it('is never itself flagged as aggressive', () => {
    for (const weightKg of [55, 70, 90, 130]) {
      const suggestion = gentlerRate(weightKg, 'week', 'metric');
      // Rounding can nudge it a hair over, so allow the rounding step.
      expect(weeklyShareOfBodyWeight(suggestion, weightKg))
        .toBeLessThanOrEqual(AGGRESSIVE_WEEKLY_SHARE + 0.001);
    }
  });
});
