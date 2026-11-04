// Logging food in seconds.
//
// Two ways in: read the numbers off a label and say how much you ate, or just
// type a calorie count when you already know it. Saved foods refill the form
// in one tap, so a repeat meal is only a grams entry away.

import { useRef, useState, type ReactNode } from 'react';
import { tryScaleCalories } from '../lib/food';
import type { FoodEntry, SavedFood } from '../lib/types';
import { Button, Card, Field, NumberInput, Segmented, TextInput } from './ui';

type Mode = 'label' | 'calories';

interface Props {
  savedFoods: SavedFood[];
  onAdd: (entry: Omit<FoodEntry, 'id'>) => Promise<void> | void;
  onSaveFood: (food: Pick<SavedFood, 'name' | 'servingGrams' | 'caloriesPerServing'>) => void;
  onUseFood: (foodId: string) => void;
  onDeleteFood: (foodId: string) => void;
  /** What has been logged today, listed inside this card below the button. */
  logged?: ReactNode;
}

export function FoodAdder({
  savedFoods, onAdd, onSaveFood, onUseFood, onDeleteFood, logged,
}: Props) {
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
  const total = mode === 'label' ? computed : plainValid ? Math.round(plain) : null;

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
    <Card className="flex flex-col gap-3.5">
      <Segmented
        value={mode}
        onChange={(next) => setMode(next)}
        options={[
          { value: 'label', label: 'From a label' },
          { value: 'calories', label: 'Just calories' },
        ]}
      />

      {savedFoods.length > 0 && mode === 'label' && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-ink-soft">Your foods</span>
          <div className="flex flex-wrap gap-2">
            {savedFoods.map((food) => (
              <span key={food.id} className="relative">
                <button
                  type="button"
                  onClick={() => fillFromSaved(food)}
                  className="rounded-full border border-line-in bg-surface py-1.5 pr-7 pl-3
                    text-sm font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-wash"
                >
                  {food.name}
                  <span className="ml-1.5 text-xs font-normal text-ink-ghost">
                    {food.caloriesPerServing}/{food.servingGrams}g
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${food.name}`}
                  onClick={() => onDeleteFood(food.id)}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full px-1
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
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={mode === 'label' ? 'e.g. Granola' : 'e.g. Dinner out'}
        />
      </Field>

      {mode === 'label' ? (
        <>
          {/* Three numbers across: the two off the packet, then what you ate.
              The last one is the only one that changes meal to meal, so it
              carries the brand border. */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Serving (g)">
              <NumberInput
                value={servingGrams}
                onChange={(event) => setServingGrams(event.target.value)}
                placeholder="100"
                className="px-3"
              />
            </Field>
            <Field label="Cal / serving">
              <NumberInput
                value={caloriesPerServing}
                onChange={(event) => setCaloriesPerServing(event.target.value)}
                placeholder="250"
                className="px-3"
              />
            </Field>
            <Field label="Eaten (g)">
              <NumberInput
                ref={gramsRef}
                value={gramsEaten}
                onChange={(event) => setGramsEaten(event.target.value)}
                placeholder="150"
                className="border-brand px-3"
              />
            </Field>
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

      {/* The running total lives on the button, so the sum and the action that
          commits it are never more than a glance apart. */}
      <Button
        onClick={handleAdd}
        disabled={!canAdd}
        className="justify-between"
      >
        <span>Add to today</span>
        <span
          aria-live="polite"
          className="tnum rounded-lg bg-white/15 px-2.5 py-1 text-sm"
        >
          {total === null ? '—' : `${total.toLocaleString()} cal`}
        </span>
      </Button>

      {logged}
    </Card>
  );
}
