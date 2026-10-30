// Unit conversion. Storage is always kg and cm; these functions exist purely
// so the screen can speak the user's language.

import type { UnitSystem } from './types';

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb: number): number => lb / LB_PER_KG;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;
export const inToCm = (inches: number): number => inches * CM_PER_IN;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;

export const feetInchesToCm = (feet: number, inches: number): number =>
  inToCm(feet * 12 + inches);

/** Splits a height into feet and inches, carrying 12" up to the next foot. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToIn(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** Converts a weight the user typed into kg for storage. */
export const toKg = (value: number, units: UnitSystem): number =>
  units === 'metric' ? value : lbToKg(value);

/** Converts a stored kg weight into the user's units for display. */
export const fromKg = (kg: number, units: UnitSystem): number =>
  units === 'metric' ? kg : kgToLb(kg);

export const weightUnitLabel = (units: UnitSystem): string =>
  units === 'metric' ? 'kg' : 'lb';

export function formatWeight(kg: number, units: UnitSystem, digits = 1): string {
  return `${fromKg(kg, units).toFixed(digits)} ${weightUnitLabel(units)}`;
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}' ${inches}"`;
}
