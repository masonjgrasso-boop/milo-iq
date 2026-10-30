import { describe, it, expect } from 'vitest';
import {
  planCatchUp, planCatchUpForUser, surplusFrom, MIN_SPREAD_DAYS, MAX_SPREAD_DAYS,
} from './catchup';
import { SAFE_MIN_CALORIES } from './targets';
import type { DayLog } from './types';

const day = (date: string, calories: number): DayLog => ({ date, calories, entries: [] });

describe('surplusFrom', () => {
  it('totals only what was eaten above target', () => {
    expect(surplusFrom([day('2026-03-02', 2500), day('2026-03-03', 2200)], 2000)).toBe(700);
  });

  it('nets under-target days against over-target ones', () => {
    expect(surplusFrom([day('2026-03-02', 2500), day('2026-03-03', 1700)], 2000)).toBe(200);
  });

  it('returns zero when the period is on or under target overall', () => {
    expect(surplusFrom([day('2026-03-02', 1800), day('2026-03-03', 1900)], 2000)).toBe(0);
  });

  it('ignores days that were never logged', () => {
    // A missed day must not read as a 2000-calorie credit.
    expect(surplusFrom([day('2026-03-02', 2500), day('2026-03-03', 0)], 2000)).toBe(500);
  });

  it('returns zero for no days', () => {
    expect(surplusFrom([], 2000)).toBe(0);
  });
});

describe('planCatchUp', () => {
  const base = { dailyTarget: 2000, safeMinimum: 1500 };

  it('does nothing when there is no surplus', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 0 });
    expect(plan.needed).toBe(false);
    expect(plan.dailyAdjustment).toBe(0);
    expect(plan.adjustedTarget).toBe(2000);
  });

  it('treats a negative surplus as nothing to do', () => {
    expect(planCatchUp({ ...base, surplusCalories: -500 }).needed).toBe(false);
  });

  it('spreads a small surplus over the minimum number of days', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 600 });
    expect(plan.days).toBe(MIN_SPREAD_DAYS);
    expect(plan.dailyAdjustment).toBe(200);
    expect(plan.adjustedTarget).toBe(1800);
    expect(plan.fullyCovered).toBe(true);
  });

  it('widens the spread rather than deepening the daily cut', () => {
    // 2400 over 3 days would be 800/day, below the 1500 floor. Spreading it
    // further keeps each day comfortable instead.
    const plan = planCatchUp({ ...base, surplusCalories: 2400 });
    expect(plan.days).toBeGreaterThan(MIN_SPREAD_DAYS);
    expect(plan.dailyAdjustment).toBeLessThanOrEqual(500);
    expect(plan.adjustedTarget).toBeGreaterThanOrEqual(1500);
  });

  it('never recommends eating below the safe minimum', () => {
    for (const surplus of [500, 1500, 3000, 7000, 20_000]) {
      const plan = planCatchUp({ ...base, surplusCalories: surplus });
      expect(plan.adjustedTarget).toBeGreaterThanOrEqual(base.safeMinimum);
    }
  });

  it('never spreads beyond the maximum number of days', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 20_000 });
    expect(plan.days).toBeLessThanOrEqual(MAX_SPREAD_DAYS);
  });

  it('lets the rest go when the surplus is too big to undo safely', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 10_000 });
    expect(plan.fullyCovered).toBe(false);
    expect(plan.shortfallCalories).toBeGreaterThan(0);
    // Still safe, still bounded.
    expect(plan.adjustedTarget).toBe(1500);
    expect(plan.days).toBe(MAX_SPREAD_DAYS);
  });

  it('accounts for every calorie between covered and shortfall', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 10_000 });
    expect(plan.coveredCalories + plan.shortfallCalories).toBeCloseTo(10_000, 0);
  });

  it('cannot adjust at all when the target already sits at the floor', () => {
    const plan = planCatchUp({ dailyTarget: 1500, safeMinimum: 1500, surplusCalories: 900 });
    expect(plan.needed).toBe(true);
    expect(plan.dailyAdjustment).toBe(0);
    expect(plan.adjustedTarget).toBe(1500);
    expect(plan.fullyCovered).toBe(false);
    expect(plan.shortfallCalories).toBe(900);
  });

  it('keeps the daily cut within what the plan claims to cover', () => {
    const plan = planCatchUp({ ...base, surplusCalories: 1000 });
    expect(plan.dailyAdjustment * plan.days).toBe(plan.coveredCalories);
  });
});

describe('planCatchUpForUser', () => {
  it('uses the floor matching the user sex', () => {
    const female = planCatchUpForUser(6000, 1600, 'female');
    expect(female.adjustedTarget).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES.female);

    const male = planCatchUpForUser(6000, 2000, 'male');
    expect(male.adjustedTarget).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES.male);
  });
});
