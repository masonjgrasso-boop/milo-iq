// Changing what you are aiming for.
//
// Switching from losing fat to building muscle is a normal thing to do, and
// the app has to handle it without making the months already logged look like
// a failure. Two things make that work:
//
//   1. The new target is anchored to the maintenance figure measured from the
//      user's own logs whenever there is one. Re-running the onboarding
//      formula would throw that measurement away and replace it with a guess
//      that can be several hundred calories out.
//   2. Every goal is saved with the day it started, so each past day stays
//      judged against the goal that was active on it. Nothing already logged
//      is changed or deleted — only the yardstick ahead of today moves.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import { useMaintenanceBasis } from '../hooks/useMaintenanceBasis';
import { profileStartDate, saveProfile } from '../lib/profile';
import { addDays, fullDateLabel, todayKey, type DayKey } from '../lib/dates';
import { MAX_WINDOW_DAYS } from '../lib/maintenance';
import {
  goalsDiffer, recordGoalChange, sortGoals, GOAL_WORDS,
} from '../lib/goals';
import {
  rateConcern, rateToKgPerWeek, PERIOD_WORDS, type RatePeriod,
} from '../lib/rate';
import {
  calculateCalorieTarget, targetFromMaintenance, ACTIVITY_LABELS,
} from '../lib/targets';
import {
  cmToFeetInches, feetInchesToCm, fromKg, kgToLb, weightUnitLabel,
} from '../lib/units';
import type {
  ActivityLevel, Goal, GoalPeriod, Sex, UnitSystem, UserProfile,
} from '../lib/types';
import { RateNote } from '../components/RateNote';
import {
  Button, Card, ConfirmDialog, Divider, Eyebrow, Field, NoteBox, OptionRow, Segmented,
  Stat, UnitInput,
} from '../components/ui';
import { Page } from '../components/Layout';

/** A stored kg-per-week rate as it should appear in the form. */
function rateForDisplay(kgPerWeek: number, units: UnitSystem): string {
  if (!(kgPerWeek > 0)) return '';
  const value = units === 'metric' ? kgPerWeek : kgToLb(kgPerWeek);
  return String(Math.round(value * 100) / 100);
}

export function Goals() {
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!profile) return null;

  return (
    <Page
      eyebrow="What you're aiming for"
      title="Goals"
      back={
        <Link to="/more" className="text-[13px] font-bold text-ink-mute hover:text-ink-soft">
          &larr; More
        </Link>
      }
    >
      {saved && !editing && (
        <NoteBox tone="wash">
          <strong>Saved.</strong> Your new goal starts today. Everything you logged before
          today is still judged against the goal you had then.
        </NoteBox>
      )}

      {editing ? (
        <GoalForm
          profile={profile}
          onDone={() => {
            setSaved(true);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <CurrentGoal profile={profile} />
          <Button
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            Change goal
          </Button>
          <GoalHistory history={profile.goalHistory ?? []} />
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------ the summary */

function CurrentGoal({ profile }: { profile: UserProfile }) {
  const words = GOAL_WORDS[profile.goal];
  const unit = weightUnitLabel(profile.units);
  const rate = rateForDisplay(profile.targetRateKgPerWeek, profile.units);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Current goal</Eyebrow>
        <h2 className="display text-[30px] text-ink">{words.label}</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Daily target" value={profile.calorieTarget.toLocaleString()} />
        <Stat
          label={profile.goal === 'maintain' ? 'Rate' : `Rate ${PERIOD_WORDS.week}`}
          value={profile.goal === 'maintain' ? 'Holding' : `${rate} ${unit}`}
        />
      </div>

      <dl className="flex flex-col">
        <Row label="Activity" value={ACTIVITY_LABELS[profile.activity]} />
        <Row
          label="Height"
          value={
            profile.units === 'metric'
              ? `${Math.round(profile.heightCm)} cm`
              : heightImperial(profile.heightCm)
          }
        />
        <Row label="Age" value={String(profile.age)} />
        <Row label="Sex" value={profile.sex === 'male' ? 'Male' : 'Female'} />
        <Row label="Units" value={profile.units === 'metric' ? 'kg / cm' : 'lb / ft-in'} />
      </dl>
    </Card>
  );
}

function heightImperial(cm: number): string {
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}' ${inches}"`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line-soft py-2.5 text-sm">
      <dt className="shrink-0 text-ink-mute">{label}</dt>
      <dd className="truncate text-right font-bold text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- the history */

/**
 * What you have aimed for, newest first.
 *
 * The oldest entry gets no start date. Its date is only ever an estimate of
 * when the account began, and `goalOn` treats anything earlier as belonging
 * to it anyway, so printing a date there would be stating something we do not
 * actually know.
 */
function GoalHistory({ history }: { history: GoalPeriod[] }) {
  const periods = sortGoals(history);
  if (periods.length < 2) return null;

  const rows = periods
    .map((period, index) => ({
      period,
      first: index === 0,
      /** The day before the next goal started, or null while still current. */
      endDate: index === periods.length - 1
        ? null
        : addDays(periods[index + 1].startDate, -1),
    }))
    .reverse();

  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>Goal history</Eyebrow>
      <ul className="flex flex-col">
        {rows.map(({ period, first, endDate }) => (
          <li
            key={period.startDate}
            className="flex items-baseline justify-between gap-4 border-t border-line-soft
              py-2.5 text-sm first:border-t-0 first:pt-0"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold text-ink">{GOAL_WORDS[period.goal].label}</span>
              <span className="text-xs text-ink-mute">{span(period.startDate, endDate, first)}</span>
            </span>
            <span className="tnum shrink-0 text-ink-mute">
              {period.calorieTarget.toLocaleString()} cal
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-faint">
        Each day is measured against the goal you held that day, so a month of deficit days
        never counts against a goal you took up afterwards.
      </p>
    </Card>
  );
}

function span(startDate: DayKey, endDate: DayKey | null, first: boolean): string {
  if (endDate === null) return `Since ${fullDateLabel(startDate)}`;
  if (first) return `Up to ${fullDateLabel(endDate)}`;
  return `${fullDateLabel(startDate)} – ${fullDateLabel(endDate)}`;
}

/* ---------------------------------------------------------------- the form */

function GoalForm({ profile, onDone, onCancel }: {
  profile: UserProfile;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user, setProfile } = useAuth();

  const [units, setUnits] = useState<UnitSystem>(profile.units);
  const [feet, setFeet] = useState(String(cmToFeetInches(profile.heightCm).feet));
  const [inches, setInches] = useState(String(cmToFeetInches(profile.heightCm).inches));
  const [cm, setCm] = useState(String(Math.round(profile.heightCm)));
  const [age, setAge] = useState(String(profile.age));
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activity);
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>('week');
  const [rate, setRate] = useState(rateForDisplay(profile.targetRateKgPerWeek, profile.units));

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The weight the target is worked out from comes from the logs, not from
  // the figure typed at onboarding, which is the starting weight and goes
  // stale the moment someone makes progress.
  const today = todayKey();
  const from = useMemo(() => addDays(today, -(MAX_WINDOW_DAYS - 1)), [today]);
  const { days } = useDayRange(from, today);
  const { result, latestWeightKg } = useMaintenanceBasis(days, profile);
  const weightKg = latestWeightKg ?? profile.weightKg;

  function changeUnits(next: UnitSystem) {
    // The rate is a known quantity here, not something half-typed, so it is
    // converted rather than cleared. Leaving "1" in place while the unit
    // changed from lb to kg would silently more than double the goal.
    const current = rateToKgPerWeek(Number(rate), ratePeriod, units);
    setUnits(next);
    setRate(
      current > 0
        ? rateForDisplay(ratePeriod === 'month' ? current * (52 / 12) : current, next)
        : '',
    );
  }

  const heightCm = units === 'metric'
    ? Number(cm)
    : feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
  const ageYears = Number(age);
  const rateKgPerWeek = goal === 'maintain'
    ? 0
    : rateToKgPerWeek(Number(rate), ratePeriod, units);

  const bodyValid =
    heightCm > 50 && heightCm < 280 &&
    weightKg > 20 && weightKg < 400 &&
    ageYears >= 13 && ageYears <= 120;

  // Measured maintenance wins. The formula is only a stand-in for not having
  // enough logs yet, and once the logs exist it would be a step backwards.
  const measured = result.status === 'ready' ? result.maintenanceCalories : null;
  const preview = !bodyValid
    ? null
    : measured !== null
      ? targetFromMaintenance(measured, { goal, sex, targetRateKgPerWeek: rateKgPerWeek })
      : calculateCalorieTarget({
          weightKg, heightCm, age: ageYears, sex, activity, goal,
          targetRateKgPerWeek: rateKgPerWeek,
        });

  // Without a rate the daily target would just be maintenance wearing the
  // word "goal", so it waits for one.
  const ready = preview !== null && (goal === 'maintain' || rateKgPerWeek > 0);

  const concern = preview === null
    ? 'none'
    : rateConcern({ rateKgPerWeek, weightKg, clampedToFloor: preview.clampedToFloor });

  async function handleConfirm() {
    if (!user || !preview || !ready) return;
    setBusy(true);
    setError(null);

    const startDate = todayKey();
    const nextGoal = {
      goal,
      targetRateKgPerWeek: rateKgPerWeek,
      calorieTarget: preview.calorieTarget,
      // Where milestones toward this goal are counted from.
      startWeightKg: Number(weightKg.toFixed(2)),
    };
    const currentGoal = {
      goal: profile.goal,
      targetRateKgPerWeek: profile.targetRateKgPerWeek,
      calorieTarget: profile.calorieTarget,
    };
    // The goal being left is dated from the account's start, so the weight it
    // began at is the onboarding one rather than today's.
    const previousGoal = { ...currentGoal, startWeightKg: profile.weightKg };

    const updated: UserProfile = {
      ...profile,
      units, heightCm, age: ageYears, sex, activity,
      ...nextGoal,
    };

    // Only an actual change of aim earns a history entry. Correcting a typo in
    // your height should not create a new goal period.
    if (goalsDiffer(currentGoal, nextGoal)) {
      updated.goalHistory = recordGoalChange({
        history: profile.goalHistory ?? [],
        previous: {
          // Dated from the account's start when that is known. Any earlier day
          // resolves to this entry regardless, so the date is for display; the
          // day before the change is the fallback purely so the two entries
          // cannot collide on the same start date.
          startDate: profileStartDate(profile) ?? addDays(startDate, -1),
          ...previousGoal,
        },
        next: { startDate, ...nextGoal },
      });
    }

    try {
      await saveProfile(user.uid, updated);
      setProfile(updated);
      setConfirming(false);
      onDone();
    } catch {
      setError('Could not save your goal. Check your connection and try again.');
      setConfirming(false);
    }
    setBusy(false);
  }

  const unit = weightUnitLabel(units);

  return (
    <>
      <Card className="flex flex-col gap-4">
        <Field label="Units">
          <Segmented
            value={units}
            onChange={changeUnits}
            options={[
              { value: 'imperial', label: 'lb / ft-in' },
              { value: 'metric', label: 'kg / cm' },
            ]}
          />
        </Field>

        <Field label="Height">
          {units === 'metric' ? (
            <UnitInput
              unit="cm"
              value={cm}
              onChange={(event) => setCm(event.target.value)}
              aria-label="Height in centimetres"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <UnitInput
                unit="ft"
                value={feet}
                onChange={(event) => setFeet(event.target.value)}
                aria-label="Feet"
              />
              <UnitInput
                unit="in"
                value={inches}
                onChange={(event) => setInches(event.target.value)}
                aria-label="Inches"
              />
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Age">
            <UnitInput
              unit="yrs"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              aria-label="Age in years"
            />
          </Field>
          <Field label="Sex" hint="Used only for the calorie formula.">
            <Segmented
              value={sex}
              onChange={setSex}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
          </Field>
        </div>

        <p className="text-xs text-ink-faint">
          Your weight comes from your logs, not from here &mdash; it is{' '}
          {fromKg(weightKg, units).toFixed(1)} {unit} right now.
        </p>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <span className="text-[13px] font-bold text-ink-soft">Activity level</span>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((value) => (
          <OptionRow
            key={value}
            selected={activity === value}
            label={ACTIVITY_LABELS[value]}
            onClick={() => setActivity(value)}
          />
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Goal">
          <Segmented
            value={goal}
            onChange={setGoal}
            options={[
              { value: 'lose', label: 'Lose' },
              { value: 'maintain', label: 'Maintain' },
              { value: 'gain', label: 'Gain' },
            ]}
          />
        </Field>

        {/* Maintaining has no rate to ask about, so the question goes. */}
        {goal !== 'maintain' && (
          <Field label={goal === 'lose' ? 'How much to lose' : 'How much to gain'}>
            <div className="grid grid-cols-2 gap-2.5">
              <UnitInput
                unit={unit}
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                placeholder={units === 'metric' ? '0.5' : '1'}
                aria-label={`How much to ${goal} in ${unit} ${PERIOD_WORDS[ratePeriod]}`}
              />
              <Segmented
                value={ratePeriod}
                onChange={setRatePeriod}
                options={[
                  { value: 'week', label: 'per week' },
                  { value: 'month', label: 'per month' },
                ]}
              />
            </div>
          </Field>
        )}
      </Card>

      {/* The number being saved, before it is saved. */}
      {ready && preview ? (
        <Card className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-ink-mute">Your new daily target</p>
            <p className="flex items-baseline gap-2">
              <span className="display tnum text-[38px] text-brand">
                {preview.calorieTarget.toLocaleString()}
              </span>
              <span className="text-sm text-ink-mute">cal / day</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Maintenance" value={preview.tdee.toLocaleString()} />
            <Stat
              label={goal === 'maintain' ? 'Holding steady' : 'Daily change'}
              value={
                goal === 'maintain'
                  ? '0'
                  : `${goal === 'lose' ? '−' : '+'}${Math.abs(
                      preview.tdee - preview.calorieTarget,
                    ).toLocaleString()}`
              }
              tone={goal === 'maintain' ? 'neutral' : 'good'}
            />
          </div>

          <Divider />

          <p className="text-[13px] text-ink-mute">
            {measured !== null ? (
              <>
                Worked out from the {measured.toLocaleString()} maintenance measured from
                your own logs. Height, age and activity are saved but no longer move this
                number &mdash; your logs do.
              </>
            ) : (
              <>
                A starting estimate from your height, weight, age and activity. Milo
                replaces it with your real number once you have logged a couple of weeks.
              </>
            )}
          </p>

          <RateNote
            concern={concern}
            goal={goal}
            rate={rate}
            units={units}
            period={ratePeriod}
            sex={sex}
            weightKg={weightKg}
            calorieTarget={preview.calorieTarget}
          />
        </Card>
      ) : (
        <Card tone="muted">
          <p className="text-sm text-ink-soft">
            {bodyValid
              ? `Enter how much you want to ${goal} and your new target appears here.`
              : 'Check your height and age to see your new target.'}
          </p>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <Button onClick={() => setConfirming(true)} disabled={!ready}>
          Save goal
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Start your new goal from today?"
          confirmLabel="Confirm"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        >
          <p>Your past logs, photos, and workouts stay.</p>
          {preview && (
            <p className="mt-2 text-sm text-ink-mute">
              {GOAL_WORDS[goal].label} on {preview.calorieTarget.toLocaleString()} calories
              a day, from today onwards.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
