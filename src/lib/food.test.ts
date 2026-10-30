import { describe, it, expect } from 'vitest';
import { caloriesPerGram, scaleCalories, tryScaleCalories } from './food';

describe('caloriesPerGram', () => {
  it('divides serving calories by serving size', () => {
    expect(caloriesPerGram(100, 250)).toBeCloseTo(2.5, 10);
    expect(caloriesPerGram(30, 160)).toBeCloseTo(5.3333, 4);
  });

  it('rejects a zero or negative serving size', () => {
    expect(() => caloriesPerGram(0, 250)).toThrow(RangeError);
    expect(() => caloriesPerGram(-100, 250)).toThrow(RangeError);
  });
});

describe('scaleCalories', () => {
  it('scales up when more than a serving is eaten', () => {
    expect(scaleCalories(100, 250, 150)).toBeCloseTo(375, 10);
  });

  it('scales down when less than a serving is eaten', () => {
    expect(scaleCalories(100, 250, 40)).toBeCloseTo(100, 10);
  });

  it('returns the label value for exactly one serving', () => {
    expect(scaleCalories(100, 250, 100)).toBeCloseTo(250, 10);
    expect(scaleCalories(28, 160, 28)).toBeCloseTo(160, 10);
  });

  it('returns zero when nothing was eaten', () => {
    expect(scaleCalories(100, 250, 0)).toBe(0);
  });

  it('handles a real label: 45g oats at 190 cal, 62g eaten', () => {
    expect(scaleCalories(45, 190, 62)).toBeCloseTo(261.78, 2);
  });
});

describe('tryScaleCalories', () => {
  it('rounds to whole calories', () => {
    expect(tryScaleCalories(45, 190, 62)).toBe(262);
    expect(tryScaleCalories(100, 250, 150)).toBe(375);
  });

  it('returns null while the serving size is still empty or zero', () => {
    expect(tryScaleCalories(0, 250, 150)).toBeNull();
    expect(tryScaleCalories(Number.NaN, 250, 150)).toBeNull();
  });

  it('returns null for negative or non-numeric input', () => {
    expect(tryScaleCalories(100, -250, 150)).toBeNull();
    expect(tryScaleCalories(100, 250, -1)).toBeNull();
    expect(tryScaleCalories(100, Number.NaN, 150)).toBeNull();
    expect(tryScaleCalories(Number.POSITIVE_INFINITY, 250, 150)).toBeNull();
  });

  it('allows a zero-calorie food', () => {
    expect(tryScaleCalories(100, 0, 150)).toBe(0);
  });
});
