import { describe, it, expect } from 'vitest';
import {
  mifflinStJeorBmr, estimateTdee, dailyCalorieDelta, calculateCalorieTarget,
  SAFE_MIN_CALORIES, KCAL_PER_KG,
} from './targets';

const male = { weightKg: 80, heightCm: 180, age: 30, sex: 'male' as const };
const female = { weightKg: 65, heightCm: 165, age: 30, sex: 'female' as const };

describe('mifflinStJeorBmr', () => {
  it('matches the published formula for men', () => {
    // 10(80) + 6.25(180) - 5(30) + 5 = 800 + 1125 - 150 + 5
    expect(mifflinStJeorBmr(male)).toBeCloseTo(1780, 6);
  });

  it('matches the published formula for women', () => {
    // 10(65) + 6.25(165) - 5(30) - 161 = 650 + 1031.25 - 150 - 161
    expect(mifflinStJeorBmr(female)).toBeCloseTo(1370.25, 6);
  });

  it('decreases with age', () => {
    expect(mifflinStJeorBmr({ ...male, age: 50 })).toBeLessThan(mifflinStJeorBmr(male));
  });
});

describe('estimateTdee', () => {
  it('scales the resting rate by the activity multiplier', () => {
    expect(estimateTdee({ ...male, activity: 'sedentary' })).toBeCloseTo(1780 * 1.2, 6);
    expect(estimateTdee({ ...male, activity: 'very' })).toBeCloseTo(1780 * 1.725, 6);
  });

  it('is ordered by activity level', () => {
    const at = (activity: 'sedentary' | 'light' | 'moderate' | 'very') =>
      estimateTdee({ ...male, activity });
    expect(at('sedentary')).toBeLessThan(at('light'));
    expect(at('light')).toBeLessThan(at('moderate'));
    expect(at('moderate')).toBeLessThan(at('very'));
  });
});

describe('dailyCalorieDelta', () => {
  it('spreads the weekly energy cost across seven days', () => {
    expect(dailyCalorieDelta(0.5)).toBeCloseTo((0.5 * KCAL_PER_KG) / 7, 6);
    expect(dailyCalorieDelta(0)).toBe(0);
  });

  it('is about 500 kcal/day for half a kilo a week', () => {
    expect(dailyCalorieDelta(0.5)).toBeCloseTo(550, 0);
  });
});

describe('calculateCalorieTarget', () => {
  it('subtracts the deficit when losing', () => {
    const r = calculateCalorieTarget({
      ...male, activity: 'moderate', goal: 'lose', targetRateKgPerWeek: 0.5,
    });
    expect(r.calorieTarget).toBe(Math.round(1780 * 1.55 - 550));
    expect(r.clampedToFloor).toBe(false);
  });

  it('adds the surplus when gaining', () => {
    const r = calculateCalorieTarget({
      ...male, activity: 'moderate', goal: 'gain', targetRateKgPerWeek: 0.25,
    });
    expect(r.calorieTarget).toBe(Math.round(1780 * 1.55 + 275));
  });

  it('ignores the rate entirely when maintaining', () => {
    const r = calculateCalorieTarget({
      ...male, activity: 'moderate', goal: 'maintain', targetRateKgPerWeek: 1,
    });
    expect(r.calorieTarget).toBe(r.tdee);
  });

  it('never returns a target below the safe floor', () => {
    const r = calculateCalorieTarget({
      ...female, activity: 'sedentary', goal: 'lose', targetRateKgPerWeek: 1.5,
    });
    expect(r.calorieTarget).toBe(SAFE_MIN_CALORIES.female);
    expect(r.clampedToFloor).toBe(true);
  });

  it('uses the correct floor per sex', () => {
    const r = calculateCalorieTarget({
      ...male, weightKg: 55, heightCm: 165, activity: 'sedentary',
      goal: 'lose', targetRateKgPerWeek: 1.5,
    });
    expect(r.calorieTarget).toBe(SAFE_MIN_CALORIES.male);
  });
});
