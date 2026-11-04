import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useDay } from '../hooks/useDay';
import { useDayRange } from '../hooks/useDayRange';
import { deleteFood, listFoods, saveFood, touchFood } from '../data/foods';
import {
  todayKey, friendlyDayLabel, addDays, startOfMonth, startOfWeek, shortDateLabel, weekdayLabel,
} from '../lib/dates';
import { formatWeight, fromKg, toKg, weightUnitLabel } from '../lib/units';
import { planCatchUpForUser } from '../lib/catchup';
import { estimateMaintenance, MAX_WINDOW_DAYS } from '../lib/maintenance';
import { maintenanceBasis, paceSummary } from '../lib/pace';
import { latestTrend, trendSeries } from '../lib/trend';
import type { SavedFood } from '../lib/types';
import { Button, Card, Eyebrow, HeroCard, IconButton, UnitInput } from '../components/ui';
import { FoodAdder } from '../components/FoodAdder';
import { CatchUpCard } from '../components/CatchUpCard';
import { PaceCard } from '../components/PaceCard';
import { Page } from '../components/Layout';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

export function Today() {
  const { user, profile } = useAuth();
  const notify = useToast();
  const [date, setDate] = useState(todayKey());
  const { day, loading, saving, error, addEntry, removeEntry, setWeight } =
    useDay(date);

  const [foods, setFoods] = useState<SavedFood[]>([]);
  const [weightInput, setWeightInput] = useState('');


  // One read serves everything on this screen: the week and month pace
  // figures, the maintenance window, the catch-up look-back and the rule
  // counts. At most 31 small documents, and the persistent cache means
  // re-opening the screen costs nothing.
  const lookback = useMemo(() => {
    const today = todayKey();
    const monthStart = startOfMonth(today);
    const windowStart = addDays(today, -(MAX_WINDOW_DAYS - 1));
    return { from: monthStart < windowStart ? monthStart : windowStart, to: today };
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

  // Maintenance: measured once there is enough history, the onboarding
  // estimate until then. Everything below is framed against this number.
  const maintenance = useMemo(
    () => estimateMaintenance(history ?? [], todayKey()),
    [history],
  );
  const latestWeightKg = useMemo(
    () => latestTrend(trendSeries(history ?? [])) ?? undefined,
    [history],
  );

  useEffect(() => {
    if (!user) return;
    listFoods(user.uid).then(setFoods);
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

  // Cheap filters over at most 31 days already in memory, so these sit below
  // the profile guard as plain values rather than memoised hooks.
  const basis = maintenanceBasis(maintenance, profile, latestWeightKg);
  const paceFor = (start: string, end: string) =>
    paceSummary({
      days: history ?? [],
      start,
      end,
      maintenanceCalories: basis.calories,
      targetCalories: target,
      goal: profile.goal,
    });

  const today = todayKey();
  // Shown including today, so the card reflects what has just been logged.
  const weekPace = paceFor(startOfWeek(today), today);
  const monthPace = paceFor(startOfMonth(today), today);
  // The plan is built from completed days only: a day still in progress must
  // never be counted as a shortfall before dinner.
  const weekToDate = paceFor(startOfWeek(today), addDays(today, -1));
  // Just the day on screen, for the deficit strip inside the hero.
  const dayPace = paceFor(date, date);

  const catchUp = planCatchUpForUser(weekToDate.gapTotal, target, profile.sex);
  const missedDays = (recentDays ?? []).filter((past) => past.calories === 0).length;

  const goalDeficit = Math.round(dayPace.targetPerDay);
  const deficitNow = Math.round(dayPace.actualPerDay);
  const deficitPct = goalDeficit > 0
    ? Math.max(0, Math.min(100, Math.round((deficitNow / goalDeficit) * 100)))
    : 0;

  /** One line under the deficit bar, saying where the day stands. */
  function deficitNote(): string {
    if (deficitNow < 0) {
      return 'Above maintenance so far today. One day is not the trend.';
    }
    if (goalDeficit <= 0) return 'Maintaining, so there is no deficit to chase.';
    if (deficitNow >= goalDeficit) return 'That is today’s goal already covered.';
    return `${cal(goalDeficit - deficitNow)} more to reach today’s goal.`;
  }

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
    <Page
      eyebrow={`${weekdayLabel(date)}, ${shortDateLabel(date)}`}
      title={friendlyDayLabel(date)}
      action={
        <>
          <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            &larr;
          </IconButton>
          <IconButton
            label={isToday ? 'Next day' : 'Jump to today'}
            active={!isToday}
            disabled={isToday}
            onClick={() => setDate(todayKey())}
          >
            &rarr;
          </IconButton>
        </>
      }
    >
      <HeroCard className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-[10px] text-brand-pale">Eaten</Eyebrow>
            <span className="display tnum text-5xl">{eaten.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Eyebrow className="text-[10px] text-brand-pale">
              {remaining >= 0 ? 'Left' : 'Over'}
            </Eyebrow>
            <span className="tnum text-[26px] font-extrabold">
              {Math.abs(remaining).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-all ${
              remaining >= 0 ? 'bg-brand-lite' : 'bg-over'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {dayPace.status === 'no-data' ? (
          <p className="text-xs opacity-80">
            Target {target.toLocaleString()} cal
            {saving && <span className="ml-2">Saving…</span>}
          </p>
        ) : (
          <>
            <div aria-hidden="true" className="h-px bg-white/15" />
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">
                  {isToday ? 'Today’s deficit' : 'That day’s deficit'}
                </span>
                <span className="text-sm">
                  <b className="tnum text-lg">{cal(deficitNow)}</b>{' '}
                  <span className="opacity-75">/ {cal(goalDeficit)} goal</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-surface transition-all"
                  style={{ width: `${deficitPct}%` }}
                />
              </div>
              <p className="text-xs opacity-80">{deficitNote()}</p>
            </div>
          </>
        )}
      </HeroCard>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {history && isToday && (
        <PaceCard pace={weekPace} scope="week" source={basis.source} />
      )}

      {recentDays && isToday && (
        <CatchUpCard
          plan={catchUp}
          week={weekToDate}
          month={monthPace}
          missedDays={missedDays}
        />
      )}

      <section className="flex flex-col gap-2.5">
        <Eyebrow>Add food</Eyebrow>
        <FoodAdder
          savedFoods={foods}
          onAdd={addEntry}
          onSaveFood={handleSaveFood}
          onUseFood={(foodId) => user && touchFood(user.uid, foodId)}
          onDeleteFood={handleDeleteFood}
          logged={
            loading ? (
              <p className="text-sm text-ink-ghost">Loading…</p>
            ) : day && day.entries.length > 0 ? (
              <ul className="flex flex-col">
                {day.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{entry.name}</span>
                      {entry.grams !== undefined && (
                        <span className="block text-xs text-ink-mute">{entry.grams} g</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tnum text-ink-mute">
                        {entry.calories.toLocaleString()} cal
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.name}`}
                        onClick={() => removeEntry(entry.id)}
                        className="rounded-chip px-2 py-1 text-ink-off transition hover:text-danger"
                      >
                        &times;
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <Eyebrow>Morning weight</Eyebrow>
        <Card className="flex flex-col gap-3">
          <div className="flex gap-2.5">
            <UnitInput
              size="lg"
              className="flex-1"
              unit={weightUnitLabel(profile.units)}
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              placeholder={profile.units === 'metric' ? '80.0' : '176.0'}
              aria-label={`Weight in ${weightUnitLabel(profile.units)}`}
            />
            <Button
              block={false}
              onClick={handleSaveWeight}
              disabled={!weightInput}
              variant={day?.weightKg === undefined ? 'primary' : 'secondary'}
              className="w-[120px] shrink-0"
            >
              {day?.weightKg === undefined ? 'Save' : 'Update'}
            </Button>
          </div>

          {day?.weightKg === undefined ? (
            <p className="text-[13px] text-ink-faint">
              Daily ups and downs are water. Milo smooths them into a trend.
            </p>
          ) : (
            <p className="flex items-center gap-2.5 rounded-input bg-brand-wash px-3 py-2.5 text-sm text-brand">
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-black text-white"
              >
                ✓
              </span>
              <span>
                <b>Saved.</b> {formatWeight(day.weightKg, profile.units)} for{' '}
                {friendlyDayLabel(date).toLowerCase()}
              </span>
            </p>
          )}
        </Card>
      </section>
    </Page>
  );
}
