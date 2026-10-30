import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useDay } from '../hooks/useDay';
import { useDayRange } from '../hooks/useDayRange';
import { deleteFood, listFoods, saveFood, touchFood } from '../data/foods';
import { listRules } from '../data/rules';
import { todayKey, friendlyDayLabel, addDays, startOfWeek } from '../lib/dates';
import { formatWeight, fromKg, toKg, weightUnitLabel } from '../lib/units';
import { planCatchUpForUser, surplusFrom } from '../lib/catchup';
import type { Rule, SavedFood } from '../lib/types';
import { Button, Card, NumberInput } from '../components/ui';
import { FoodAdder } from '../components/FoodAdder';
import { CatchUpCard } from '../components/CatchUpCard';
import { RuleChecklist } from '../components/RuleChecklist';
import { Page } from '../components/Layout';

export function Today() {
  const { user, profile } = useAuth();
  const notify = useToast();
  const [date, setDate] = useState(todayKey());
  const { day, loading, saving, error, addEntry, removeEntry, setWeight, setRuleValue } =
    useDay(date);

  const [foods, setFoods] = useState<SavedFood[]>([]);
  const [weightInput, setWeightInput] = useState('');

  const [rules, setRules] = useState<Rule[]>([]);

  // One fortnight-wide read serves both the catch-up look-back and this
  // week's rule counts, instead of two overlapping queries.
  const lookback = useMemo(() => {
    const today = todayKey();
    return { from: addDays(today, -13), to: today };
  }, []);
  const { days: history } = useDayRange(lookback.from, lookback.to);

  // Catch-up looks only at completed days. Judging a day that is still in
  // progress would tell someone they are "over" before dinner.
  const recentDays = useMemo(
    () =>
      history?.filter(
        (past) => past.date >= addDays(todayKey(), -7) && past.date < todayKey(),
      ) ?? null,
    [history],
  );
  const weekDays = useMemo(
    () => history?.filter((past) => past.date >= startOfWeek(todayKey())) ?? [],
    [history],
  );

  useEffect(() => {
    if (!user) return;
    listFoods(user.uid).then(setFoods);
    listRules(user.uid).then(setRules);
  }, [user]);

  // Reflect whatever is already stored for the day being viewed.
  useEffect(() => {
    if (!profile) return;
    setWeightInput(
      day?.weightKg === undefined ? '' : fromKg(day.weightKg, profile.units).toFixed(1),
    );
  }, [day?.weightKg, profile]);

  if (!profile) return null;

  const target = profile.calorieTarget;
  const eaten = day?.calories ?? 0;
  const remaining = target - eaten;
  const percent = Math.min(100, Math.round((eaten / target) * 100));
  const isToday = date === todayKey();

  const catchUp = planCatchUpForUser(
    surplusFrom(recentDays ?? [], target),
    target,
    profile.sex,
  );
  const missedDays = (recentDays ?? []).filter((past) => past.calories === 0).length;

  async function handleSaveWeight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value <= 0) {
      notify('That does not look like a weight. Try again.', 'error');
      return;
    }
    // useDay confirms the save, so there is nothing to announce here.
    await setWeight(toKg(value, profile!.units));
  }

  async function handleSaveFood(food: Pick<SavedFood, 'name' | 'servingGrams' | 'caloriesPerServing'>) {
    if (!user) return;
    try {
      const saved = await saveFood(user.uid, food);
      setFoods((current) => [...current, saved]);
      notify(`${saved.name} saved to your foods`);
    } catch {
      notify('Could not save that food. Check your connection.', 'error');
    }
  }

  async function handleDeleteFood(foodId: string) {
    if (!user) return;
    const previous = foods;
    setFoods((current) => current.filter((food) => food.id !== foodId));
    try {
      await deleteFood(user.uid, foodId);
      notify('Food removed');
    } catch {
      setFoods(previous);
      notify('Could not remove that food. Check your connection.', 'error');
    }
  }

  return (
    <Page title={friendlyDayLabel(date)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDate(addDays(date, -1))}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          &larr; Previous
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(todayKey())}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            Jump to today
          </button>
        )}
        <button
          type="button"
          onClick={() => setDate(addDays(date, 1))}
          disabled={isToday}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500
            hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          Next &rarr;
        </button>
      </div>

      <Card className="border-brand-200 bg-brand-50">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-medium text-brand-700">Eaten</p>
            <p className="text-4xl font-bold text-brand-700">{eaten.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-brand-700">
              {remaining >= 0 ? 'Left' : 'Over'}
            </p>
            <p className="text-2xl font-semibold text-brand-700">
              {Math.abs(remaining).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-brand-200">
          <div
            className={`h-full rounded-full transition-all ${
              remaining >= 0 ? 'bg-brand-600' : 'bg-amber-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-brand-700">
          Target {target.toLocaleString()} cal
          {saving && <span className="ml-2 text-brand-600">Saving…</span>}
        </p>
      </Card>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {recentDays && isToday && (
        <div className="mt-4">
          <CatchUpCard plan={catchUp} missedDays={missedDays} />
        </div>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Add food</h2>
      <FoodAdder
        savedFoods={foods}
        onAdd={addEntry}
        onSaveFood={handleSaveFood}
        onUseFood={(foodId) => user && touchFood(user.uid, foodId)}
        onDeleteFood={handleDeleteFood}
      />

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">
        Logged {day && day.entries.length > 0 && `(${day.entries.length})`}
      </h2>
      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : day && day.entries.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {day.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{entry.name}</p>
                  {entry.grams !== undefined && (
                    <p className="text-xs text-slate-500">{entry.grams} g</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-slate-900">
                    {entry.calories.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => removeEntry(entry.id)}
                    className="rounded-lg px-2 py-1 text-slate-300 transition hover:text-red-500"
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Rules</h2>
      <RuleChecklist
        rules={rules}
        date={date}
        day={day}
        weekDays={weekDays}
        onChange={setRuleValue}
      />

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Weight</h2>
      <Card>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <NumberInput
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              placeholder={profile.units === 'metric' ? '80.0' : '176.0'}
              aria-label={`Weight in ${weightUnitLabel(profile.units)}`}
            />
          </div>
          <span className="pb-3 text-sm text-slate-500">{weightUnitLabel(profile.units)}</span>
          <div className="w-28">
            <Button onClick={handleSaveWeight} disabled={!weightInput}>
              Save
            </Button>
          </div>
        </div>
        {day?.weightKg === undefined ? (
          <p className="mt-2 text-xs text-slate-500">
            Weigh in whenever you can. Milo IQ follows the trend, not any single day.
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-700">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path
                d="M4 12.5l5 5L20 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {formatWeight(day.weightKg, profile.units)} logged for{' '}
            {friendlyDayLabel(date).toLowerCase()}
          </p>
        )}
      </Card>
    </Page>
  );
}
