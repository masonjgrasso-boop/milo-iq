import { describe, it, expect } from 'vitest';
import { calculateBmi, bmiCategory, healthyWeightRangeKg, BMI_CATEGORY_LABELS } from './bmi';

describe('calculateBmi', () => {
  it('matches the standard formula', () => {
    // 80kg at 1.80m = 80 / 3.24
    expect(calculateBmi(80, 180)).toBeCloseTo(24.691, 3);
    expect(calculateBmi(70, 175)).toBeCloseTo(22.857, 3);
  });

  it('rises with weight at a fixed height', () => {
    expect(calculateBmi(90, 180)).toBeGreaterThan(calculateBmi(80, 180));
  });

  it('falls with height at a fixed weight', () => {
    expect(calculateBmi(80, 190)).toBeLessThan(calculateBmi(80, 180));
  });

  it('rejects a non-positive height rather than returning Infinity', () => {
    expect(() => calculateBmi(80, 0)).toThrow(RangeError);
    expect(() => calculateBmi(80, -180)).toThrow(RangeError);
  });
});

describe('bmiCategory', () => {
  it('classifies each band', () => {
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(22)).toBe('normal');
    expect(bmiCategory(27)).toBe('overweight');
    expect(bmiCategory(35)).toBe('obese');
  });

  it('puts each boundary in the higher band', () => {
    expect(bmiCategory(18.49)).toBe('underweight');
    expect(bmiCategory(18.5)).toBe('normal');
    expect(bmiCategory(24.99)).toBe('normal');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(29.99)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese');
  });

  it('has a label for every category', () => {
    for (const bmi of [17, 22, 27, 35]) {
      expect(BMI_CATEGORY_LABELS[bmiCategory(bmi)]).toBeTruthy();
    }
  });
});

describe('healthyWeightRangeKg', () => {
  it('returns the weights that land in the healthy band', () => {
    const { minKg, maxKg } = healthyWeightRangeKg(180);
    expect(bmiCategory(calculateBmi(minKg, 180))).toBe('normal');
    expect(bmiCategory(calculateBmi(maxKg, 180))).toBe('normal');
    expect(minKg).toBeLessThan(maxKg);
  });

  it('scales with height', () => {
    expect(healthyWeightRangeKg(190).minKg).toBeGreaterThan(healthyWeightRangeKg(170).minKg);
  });
});
