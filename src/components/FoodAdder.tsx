// Logging food in seconds.
//
// Two ways in: read the numbers off a label and say how much you ate, or just
// type a calorie count when you already know it. Saved foods refill the form
// in one tap, so a repeat meal is only a grams entry away.

import { useRef, useState } from 'react';
import { tryScaleCalories } from '../lib/food';
import type { FoodEntry, SavedFood } from '../lib/types';
import { Button, Card, Choice, Field, NumberInput } from './ui';

type Mode = 'label' | 'calories';

interface Props {
  savedFoods: SavedFood[];
  onAdd: (entry: Omit<FoodEntry, 'id'>) => Promise<void> | void;
  onSaveFood: (food: Pick<SavedFood, 'name' | 'servingGrams' | 'caloriesPerServing'>) => void;
  onUseFood: (foodId: string) => void;
  onDeleteFood: (foodId: string) => void;
}

export function FoodAdder({ savedFoods, onAdd, onSaveFood, onUseFood, onDeleteFood }: Props) {
  const [mode, setMode] = useState<Mode>('label');
  const [name, setName] = useState('');
  const [servingGrams, setServingGrams] = useState('');
  const [caloriesPerServing, setCaloriesPerServing] = useState('');
  const [gramsEaten, setGramsEaten] = useState('');
  const [plainCalories, setPlainCalories] = useState('');
  const [saveForReuse, setSaveForReuse] = useState(true);
  /** Set when the form was filled from a saved food, so we can bump its count. */
  const [fromFoodId, setFromFoodId] = useState<string | null>(null);
  const gramsRef = useRef<HTMLInputElement>(null);

  const computed = tryScaleCalories(
    Number(servingGrams), Number(caloriesPerServing), Number(gramsEaten),
  );
  const plain = Number(plainCalories);
  const plainValid = Number.isFinite(plain) && plain > 0;

  const canAdd = mode === 'label' ? computed !== null && Number(gramsEaten) > 0 : plainValid;

  function reset() {
    setName('');
    setServingGrams('');
    setCaloriesPerServing('');
    setGramsEaten('');
    setPlainCalories('');
    setFromFoodId(null);
    setSaveForReuse(true);
  }

  function fillFromSaved(food: SavedFood) {
    setMode('label');
    setName(food.name);
    setServingGrams(String(food.servingGrams));
    setCaloriesPerServing(String(food.caloriesPerServing));
    setGramsEaten('');
    setFromFoodId(food.id);
    // Already saved, so do not offer to save it again.
    setSaveForReuse(false);
    gramsRef.current?.focus();
  }

  async function handleAdd() {
    if (!canAdd) return;

    if (mode === 'label' && computed !== null) {
      await onAdd({
        name: name.trim() || 'Food',
        calories: computed,
        grams: Number(gramsEaten),
        servingGrams: Number(servingGrams),
        caloriesPerServing: Number(caloriesPerServing),
      });

      if (fromFoodId) onUseFood(fromFoodId);
      else if (saveForReuse && name.trim()) {
        onSaveFood({
          name: name.trim(),
          servingGrams: Number(servingGrams),
          caloriesPerServing: Number(caloriesPerServing),
        });
      }
    } else {
      await onAdd({ name: name.trim() || 'Quick entry', calories: Math.round(plain) });
    }

    reset();
  }

  return (
    <Card className="space-y-4">
      <Choice
        value={mode}
        onChange={(next) => setMode(next)}
        options={[
          { value: 'label', label: 'From a label' },
          { value: 'calories', label: 'Just calories' },
        ]}
      />

      {savedFoods.length > 0 && mode === 'label' && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Your foods</p>
          <div className="flex flex-wrap gap-2">
            {savedFoods.map((food) => (
              <span key={food.id} className="group relative">
                <button
                  type="button"
                  onClick={() => fillFromSaved(food)}
                  className="rounded-full border border-line-in bg-white py-1.5 pl-3 pr-7
                    text-sm text-ink-soft transition hover:border-brand hover:bg-brand-wash"
                >
                  {food.name}
                  <span className="ml-1.5 text-xs text-ink-ghost">
                    {food.caloriesPerServing}/{food.servingGrams}g
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${food.name}`}
                  onClick={() => onDeleteFood(food.id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-1
                    text-ink-off transition hover:text-danger"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={mode === 'label' ? 'Greek yogurt' : 'Dinner out'}
          className="w-full rounded-xl border border-line-in px-3 py-2.5 text-ink
            outline-none focus:border-brand focus:ring-2 focus:ring-brand-pill"
        />
      </Field>

      {mode === 'label' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serving size (g)">
              <NumberInput
                value={servingGrams}
                onChange={(event) => setServingGrams(event.target.value)}
                placeholder="100"
              />
            </Field>
            <Field label="Calories per serving">
              <NumberInput
                value={caloriesPerServing}
                onChange={(event) => setCaloriesPerServing(event.target.value)}
                placeholder="250"
              />
            </Field>
          </div>

          <Field label="How much did you eat? (g)">
            <NumberInput
              ref={gramsRef}
              value={gramsEaten}
              onChange={(event) => setGramsEaten(event.target.value)}
              placeholder="150"
            />
          </Field>

          <div
            aria-live="polite"
            className="rounded-xl bg-muted px-4 py-3 text-center text-ink-mute"
          >
            {computed !== null && Number(gramsEaten) > 0 ? (
              <span className="text-2xl font-bold text-ink">
                {computed.toLocaleString()}{' '}
                <span className="text-base font-semibold text-ink-mute">cal</span>
              </span>
            ) : (
              <span className="text-sm">Fill in the three numbers above</span>
            )}
          </div>

          {!fromFoodId && name.trim() && (
            <label className="flex items-center gap-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={saveForReuse}
                onChange={(event) => setSaveForReuse(event.target.checked)}
                className="h-4 w-4 rounded border-line-in accent-brand"
              />
              Save to my foods for one-tap reuse
            </label>
          )}
        </>
      ) : (
        <Field label="Calories">
          <NumberInput
            value={plainCalories}
            onChange={(event) => setPlainCalories(event.target.value)}
            placeholder="650"
          />
        </Field>
      )}

      <Button onClick={handleAdd} disabled={!canAdd}>
        Add to today
      </Button>
    </Card>
  );
}
