// Scaling a food's label numbers to the amount actually eaten.
//
// Nutrition labels give calories for one serving, but almost nobody eats
// exactly one serving. This is the arithmetic the user should never have to
// do in their head.

export function caloriesPerGram(servingGrams: number, caloriesPerServing: number): number {
  if (!(servingGrams > 0)) throw new RangeError('Serving size must be greater than zero');
  return caloriesPerServing / servingGrams;
}

/** Calories in `gramsEaten`, given a label's serving size and calories. */
export function scaleCalories(
  servingGrams: number,
  caloriesPerServing: number,
  gramsEaten: number,
): number {
  return caloriesPerGram(servingGrams, caloriesPerServing) * gramsEaten;
}

/**
 * The same calculation, for live use while the user is still typing: returns
 * null instead of throwing when the inputs are not yet usable.
 */
export function tryScaleCalories(
  servingGrams: number,
  caloriesPerServing: number,
  gramsEaten: number,
): number | null {
  const usable =
    Number.isFinite(servingGrams) && servingGrams > 0 &&
    Number.isFinite(caloriesPerServing) && caloriesPerServing >= 0 &&
    Number.isFinite(gramsEaten) && gramsEaten >= 0;
  if (!usable) return null;
  return Math.round(scaleCalories(servingGrams, caloriesPerServing, gramsEaten));
}
