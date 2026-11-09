import { describe, it, expect } from 'vitest';
import {
  fixFor, maxIncrease, planCatchUp, planCatchUpForUser, planRecovery, surplusFrom,
  MAX_DAILY_INCREASE, MIN_SPREAD_DAYS, MAX_SPREAD_DAYS, RECOVERY_DAYS, MAX_RECOVERY_DAYS,
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

describe('planRecovery', () => {
  // Target 2,000 against a 1,500 floor, so at most 500 a day can come off.
  const target = 2000;

  it('spreads a modest shortfall across exactly thirty days', () => {
    const plan = planRecovery(120, 840, target, 'male');
    expect(plan.needed).toBe(true);
    expect(plan.days).toBe(RECOVERY_DAYS);
    expect(plan.dailyAdjustment).toBe(28);
    expect(plan.fullyCovered).toBe(true);
  });

  it('chases at most a month of the shortfall, however long the period', () => {
    // A year behind by 120 a day is 43,800 calories; only 3,600 is chased.
    const year = planRecovery(120, 43_800, target, 'male');
    const month = planRecovery(120, 3600, target, 'male');
    expect(year.surplusCalories).toBe(3600);
    expect(year.dailyAdjustment).toBe(month.dailyAdjustment);
  });

  it('widens past thirty days rather than cutting below the safe floor', () => {
    const plan = planRecovery(1000, 30_000, target, 'male');
    expect(plan.days).toBeGreaterThan(RECOVERY_DAYS);
    expect(plan.days).toBeLessThanOrEqual(MAX_RECOVERY_DAYS);
    expect(plan.adjustedTarget).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES.male);
  });

  it('lets the rest go when even the widest spread cannot cover it', () => {
    const plan = planRecovery(2000, 60_000, target, 'male');
    expect(plan.days).toBe(MAX_RECOVERY_DAYS);
    expect(plan.adjustedTarget).toBe(SAFE_MIN_CALORIES.male);
    expect(plan.fullyCovered).toBe(false);
    expect(plan.shortfallCalories).toBeGreaterThan(0);
  });

  it('never suggests eating less when there is no shortfall', () => {
    expect(planRecovery(-120, -840, target, 'male').needed).toBe(false);
    expect(planRecovery(0, 0, target, 'male').needed).toBe(false);
  });

  it('respects the lower floor for women', () => {
    const plan = planRecovery(1000, 30_000, 1300, 'female');
    expect(plan.adjustedTarget).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES.female);
  });
});

describe('catching up on a gain goal', () => {
  const target = 3000;

  it('moves the target up rather than down', () => {
    const plan = planCatchUp({
      surplusCalories: 900,
      dailyTarget: target,
      safeMinimum: SAFE_MIN_CALORIES.male,
      fix: 'eat-more',
    });

    expect(plan.fix).toBe('eat-more');
    expect(plan.dailyAdjustment).toBe(300);
    expect(plan.adjustedTarget).toBe(3300);
  });

  it('never suggests an extreme amount, however far behind', () => {
    // 20,000 behind across three days would be 6,600 a day without the cap.
    const plan = planCatchUp({
      surplusCalories: 20_000,
      dailyTarget: target,
      safeMinimum: SAFE_MIN_CALORIES.male,
      fix: 'eat-more',
    });

    expect(plan.dailyAdjustment).toBeLessThanOrEqual(MAX_DAILY_INCREASE);
    expect(plan.adjustedTarget).toBeLessThanOrEqual(target + MAX_DAILY_INCREASE);
    // And it says plainly that it is not chasing the rest.
    expect(plan.fullyCovered).toBe(false);
    expect(plan.shortfallCalories).toBeGreaterThan(0);
  });

  it('scales the cap down for a smaller target', () => {
    // A fifth of 1,500 is 300, which is less than the hard cap.
    expect(maxIncrease(1500)).toBe(300);
    expect(maxIncrease(3000)).toBe(MAX_DAILY_INCREASE);
    expect(maxIncrease(0)).toBe(0);
  });

  it('widens the spread before deepening the increase', () => {
    const plan = planCatchUp({
      surplusCalories: 2400,
      dailyTarget: target,
      safeMinimum: SAFE_MIN_CALORIES.male,
      fix: 'eat-more',
    });

    expect(plan.days).toBeGreaterThan(MIN_SPREAD_DAYS);
    expect(plan.days).toBeLessThanOrEqual(MAX_SPREAD_DAYS);
    expect(plan.dailyAdjustment).toBeLessThanOrEqual(MAX_DAILY_INCREASE);
  });

  it('offers nothing when a gain goal is already ahead', () => {
    expect(planCatchUpForUser(-500, target, 'male', 'gain').needed).toBe(false);
  });

  it('picks the direction from the goal', () => {
    expect(fixFor('gain')).toBe('eat-more');
    expect(fixFor('lose')).toBe('eat-less');
    expect(fixFor('maintain')).toBe('eat-less');

    expect(planCatchUpForUser(900, target, 'male', 'gain').adjustedTarget)
      .toBeGreaterThan(target);
    expect(planCatchUpForUser(900, target, 'male', 'lose').adjustedTarget)
      .toBeLessThan(target);
  });

  it('keeps the safe floor out of it, since eating more cannot breach it', () => {
    // A tiny target that eating less could not safely move at all.
    const plan = planCatchUp({
      surplusCalories: 600,
      dailyTarget: SAFE_MIN_CALORIES.female,
      safeMinimum: SAFE_MIN_CALORIES.female,
      fix: 'eat-more',
    });

    expect(plan.needed).toBe(true);
    expect(plan.dailyAdjustment).toBeGreaterThan(0);
    expect(plan.adjustedTarget).toBeGreaterThan(SAFE_MIN_CALORIES.female);
  });

  it('still recovers over a month when that is the horizon', () => {
    const plan = planRecovery(200, 6000, target, 'male', 'gain');
    expect(plan.fix).toBe('eat-more');
    expect(plan.days).toBeGreaterThanOrEqual(RECOVERY_DAYS);
    expect(plan.adjustedTarget).toBeGreaterThan(target);
  });
});
