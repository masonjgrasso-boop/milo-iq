import { describe, it, expect } from 'vitest';
import {
  lbToKg, kgToLb, inToCm, cmToIn, feetInchesToCm, cmToFeetInches,
  toKg, fromKg, formatWeight, formatHeight,
} from './units';

describe('weight conversion', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
    expect(lbToKg(0)).toBe(0);
  });

  it('converts kilograms to pounds', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
  });

  it('round-trips without drift', () => {
    expect(kgToLb(lbToKg(185))).toBeCloseTo(185, 9);
  });
});

describe('height conversion', () => {
  it('converts inches to centimetres', () => {
    expect(inToCm(70)).toBeCloseTo(177.8, 6);
    expect(cmToIn(177.8)).toBeCloseTo(70, 6);
  });

  it('converts feet and inches to centimetres', () => {
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 6);
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 6);
  });

  it('splits centimetres back into feet and inches', () => {
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
  });

  it('carries a rounded 12 inches up to the next foot', () => {
    // 181.5cm is 71.46", which rounds to 71" = 5'11" — not 5'12".
    expect(cmToFeetInches(181.5)).toEqual({ feet: 5, inches: 11 });
    // 182.7cm is 71.93", which rounds to 72" and must become 6'0".
    expect(cmToFeetInches(182.7)).toEqual({ feet: 6, inches: 0 });
  });
});

describe('unit-aware helpers', () => {
  it('stores metric input unchanged', () => {
    expect(toKg(80, 'metric')).toBe(80);
    expect(fromKg(80, 'metric')).toBe(80);
  });

  it('converts imperial input to kilograms', () => {
    expect(toKg(176.37, 'imperial')).toBeCloseTo(80, 2);
    expect(fromKg(80, 'imperial')).toBeCloseTo(176.37, 2);
  });

  it('formats weight in the chosen units', () => {
    expect(formatWeight(80, 'metric')).toBe('80.0 kg');
    expect(formatWeight(80, 'imperial')).toBe('176.4 lb');
  });

  it('formats height in the chosen units', () => {
    expect(formatHeight(177.8, 'metric')).toBe('178 cm');
    expect(formatHeight(177.8, 'imperial')).toBe('5\' 10"');
  });
});
