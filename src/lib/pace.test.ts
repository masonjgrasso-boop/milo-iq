import { describe, it, expect } from 'vitest';
import { maintenanceBasis, paceSummary, MIN_WORTH_CHASING } from './pace';
import { planCatchUpForUser } from './catchup';
import { SAFE_MIN_CALORIES } from './targets';
import type { MaintenanceResult } from './maintenance';
import type { DayLog, UserProfile } from './types';

const profile: UserProfile = {
  units: 'metric',
  heightCm: 180,
  weightKg: 85,
  age: 35,
  sex: 'male',
  goal: 'lose',
  activity: 'light',
  targetRateKgPerWeek: 0.45,
  calorieTarget: 2000,
};

/** Days Monday 2026-03-02 onward; a calorie value of 0 means nothing logged. */
function days(calories: (number | null)[], from = '2026-03-02'): DayLog[] {
  const start = new Date(`${from}T00:00:00`);
  return calories.map((value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      calories: value ?? 0,
      entries: [],
    };
  });
}

const window = { start: '2026-03-02', end: '2026-03-08' };

describe('maintenanceBasis', () => {
  const notReady: MaintenanceResult = {
    status: 'not-ready',
    daysLogged: 4,
    weighIns: 1,
    daysStillNeeded: 10,
    reason: 'needs-days',
  };

  const ready: MaintenanceResult = {
    status: 'ready',
    maintenanceCalories: 2750,
    confidence: 'medium',
    windowDays: 28,
    daysLogged: 22,
    weighIns: 9,
    avgIntake: 2300,
    trendChangeKg: -1.2,
  };

  it('uses the measured figure once it is ready', () => {
    const basis = maintenanceBasis(ready, profile);
    expect(basis).toEqual({ calories: 2750, source: 'measured', confidence: 'medium' });
  });

  it('falls back to the onboarding estimate before then', () => {
    const basis = maintenanceBasis(notReady, profile);
    expect(basis.source).toBe('estimated');
    expect(basis.confidence).toBeUndefined();
    // Mifflin-St Jeor for this profile, times the 1.375 light-activity factor.
    expect(basis.calories).toBeGreaterThan(2300);
    expect(basis.calories).toBeLessThan(2600);
  });

  it('prefers the current trend weight over the onboarding weight', () => {
    const atOnboarding = maintenanceBasis(notReady, profile).calories;
    const lighter = maintenanceBasis(notReady, profile, 78).calories;
    expect(lighter).toBeLessThan(atOnboarding);
  });

  it('never reports an estimate as measured', () => {
    expect(maintenanceBasis(notReady, profile).source).not.toBe('measured');
  });
});

describe('paceSummary', () => {
  it('reports the three numbers for a worked example', () => {
    // Maintenance 2,500, target 2,000, five logged days averaging 2,120.
    const summary = paceSummary({
      days: days([2000, 2100, 2200, 2150, 2150, null, null]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.daysLogged).toBe(5);
    expect(summary.avgIntake).toBe(2120);
    expect(summary.actualPerDay).toBe(380); // below maintenance
    expect(summary.targetPerDay).toBe(500); // the plan's deficit
    expect(summary.gapPerDay).toBe(120); // behind by this much a day
    expect(summary.gapTotal).toBe(600);
    expect(summary.status).toBe('behind');
    expect(summary.worthChasing).toBe(true);
  });

  it('counts only the days actually logged', () => {
    // Two days at target, five blank. A blank day must not read as a fast.
    const summary = paceSummary({
      days: days([2000, 2000, null, null, null, null, null]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.daysLogged).toBe(2);
    expect(summary.actualPerDay).toBe(500);
    expect(summary.actualTotal).toBe(1000); // not 3,500
    expect(summary.status).toBe('ahead');
  });

  it('says nothing when nothing is logged', () => {
    const summary = paceSummary({
      days: days([null, null, null]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.status).toBe('no-data');
    expect(summary.worthChasing).toBe(false);
    expect(summary.actualTotal).toBe(0);
  });

  it('is ahead when the deficit beats the plan', () => {
    const summary = paceSummary({
      days: days([1800, 1850, 1800]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.actualPerDay).toBeGreaterThan(summary.targetPerDay);
    expect(summary.gapPerDay).toBeLessThan(0);
    expect(summary.status).toBe('ahead');
    expect(summary.worthChasing).toBe(false);
  });

  it('treats a trivial shortfall as on track rather than a problem', () => {
    // 20 calories a day short across three days: 60 total, under the floor.
    const summary = paceSummary({
      days: days([2020, 2020, 2020]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.gapTotal).toBeLessThan(MIN_WORTH_CHASING);
    expect(summary.status).toBe('on-track');
    expect(summary.worthChasing).toBe(false);
  });

  it('flags eating above maintenance without flipping the sign', () => {
    const summary = paceSummary({
      days: days([3000, 3200, 3100]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.actualPerDay).toBeLessThan(0); // above maintenance
    expect(summary.status).toBe('above-maintenance');
    expect(summary.worthChasing).toBe(true);
  });

  it('reads a maintain goal as distance from maintenance', () => {
    const summary = paceSummary({
      days: days([2500, 2500, 2500]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2500,
      goal: 'maintain',
    });

    expect(summary.targetPerDay).toBe(0);
    expect(summary.actualPerDay).toBe(0);
    expect(summary.gapPerDay).toBe(0);
    expect(summary.status).toBe('above-maintenance'); // at maintenance exactly
  });

  it('reads a gain goal as a surplus, and does not call it over-eating', () => {
    // Target above maintenance, so the intended "deficit" is negative.
    const summary = paceSummary({
      days: days([2900, 2900, 2900]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 3000,
      goal: 'gain',
    });

    expect(summary.targetPerDay).toBe(-500); // a 500 surplus was the plan
    expect(summary.actualPerDay).toBe(-400); // 400 over maintenance so far
    expect(summary.gapPerDay).toBe(-100); // ahead of the surplus plan
    expect(summary.status).not.toBe('above-maintenance');
  });

  it('ignores days outside the period', () => {
    const summary = paceSummary({
      // 2026-02-25 through 2026-03-03 (2026 is not a leap year).
      days: days([2000, 2000, 2000, 2000, 2000, 2000, 2000], '2026-02-25'),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    // Only 2026-03-02 and 2026-03-03 fall inside the window.
    expect(summary.daysLogged).toBe(2);
  });
});

describe('the gap feeding the catch-up plan', () => {
  it('turns a week behind pace into a small daily adjustment', () => {
    const summary = paceSummary({
      days: days([2000, 2100, 2200, 2150, 2150, null, null]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    const plan = planCatchUpForUser(summary.gapTotal, summary.targetCalories, 'male');

    expect(plan.needed).toBe(true);
    expect(plan.days).toBeGreaterThanOrEqual(3);
    expect(plan.days).toBeLessThanOrEqual(7);
    expect(plan.dailyAdjustment).toBeGreaterThan(0);
    expect(plan.coveredCalories).toBeLessThanOrEqual(summary.gapTotal);
  });

  it('never drops the adjusted target below the safe minimum', () => {
    // A huge gap against a target already close to the floor.
    const summary = paceSummary({
      days: days([4000, 4000, 4000, 4000, 4000]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 1600,
      goal: 'lose',
    });

    const plan = planCatchUpForUser(summary.gapTotal, summary.targetCalories, 'male');
    expect(plan.adjustedTarget).toBeGreaterThanOrEqual(SAFE_MIN_CALORIES.male);
  });

  it('offers no plan at all when ahead of pace', () => {
    const summary = paceSummary({
      days: days([1800, 1800, 1800]),
      ...window,
      maintenanceCalories: 2500,
      targetCalories: 2000,
      goal: 'lose',
    });

    expect(summary.worthChasing).toBe(false);
    // A negative gap must never be read as something to make up.
    expect(planCatchUpForUser(summary.gapTotal, summary.targetCalories, 'male').needed)
      .toBe(false);
  });
});
