// Body mass index.
//
// BMI is a crude population measure, not a verdict on an individual — it takes
// no account of muscle mass or build. The UI says so; this module just does
// the arithmetic.

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export function calculateBmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) throw new RangeError('Height must be greater than zero');
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: 'Underweight',
  normal: 'Healthy range',
  overweight: 'Overweight',
  obese: 'Obese',
};

/** The weight range that would put this height in the healthy BMI band. */
export function healthyWeightRangeKg(heightCm: number): { minKg: number; maxKg: number } {
  const heightM = heightCm / 100;
  return { minKg: 18.5 * heightM * heightM, maxKg: 24.9 * heightM * heightM };
}
