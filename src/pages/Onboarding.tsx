import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { saveProfile } from '../lib/profile';
import { feetInchesToCm, toKg, weightUnitLabel, lbToKg } from '../lib/units';
import { ACTIVITY_LABELS, calculateCalorieTarget } from '../lib/targets';
import type { ActivityLevel, Goal, Sex, UnitSystem, UserProfile } from '../lib/types';
import {
  Button, Card, Choice, Eyebrow, Field, OptionRow, Segmented, UnitInput,
} from '../components/ui';

// Weekly rate choices, offered in whatever units the user picked but always
// stored in kg.
const RATE_OPTIONS: Record<UnitSystem, number[]> = {
  imperial: [0.5, 1, 1.5, 2],
  metric: [0.25, 0.5, 0.75, 1],
};
const DEFAULT_RATE: Record<UnitSystem, number> = { imperial: 1, metric: 0.5 };

/**
 * The second line on each activity option. The label itself comes from the
 * shared ACTIVITY_LABELS, so these only say what that does not: what the
 * week actually feels like.
 */
const ACTIVITY_DETAIL: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, nothing deliberate',
  light: 'A walk most days, or a couple of sessions',
  moderate: 'Training is part of your week',
  very: 'Training is most of your week',
};

export function Onboarding() {
  const { user, setProfile } = useAuth();
  const navigate = useNavigate();

  const [units, setUnits] = useState<UnitSystem>('imperial');
  const [feet, setFeet] = useState('5');
  const [inches, setInches] = useState('10');
  const [cm, setCm] = useState('178');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [activity, setActivity] = useState<ActivityLevel>('sedentary');
  const [goal, setGoal] = useState<Goal>('lose');
  const [rate, setRate] = useState(DEFAULT_RATE.imperial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeUnits(next: UnitSystem) {
    setUnits(next);
    setRate(DEFAULT_RATE[next]);
    setWeight('');
  }

  const heightCm = units === 'metric'
    ? Number(cm)
    : feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
  const weightKg = toKg(Number(weight), units);
  const ageYears = Number(age);
  const targetRateKgPerWeek = units === 'metric' ? rate : lbToKg(rate);

  const valid =
    heightCm > 50 && heightCm < 280 &&
    weightKg > 20 && weightKg < 400 &&
    ageYears >= 13 && ageYears <= 120;

  const preview = valid
    ? calculateCalorieTarget({
        weightKg, heightCm, age: ageYears, sex, activity, goal, targetRateKgPerWeek,
      })
    : null;

  async function handleSubmit() {
    if (!user || !preview) return;
    setSaving(true);
    setError(null);

    const profile: UserProfile = {
      units, heightCm, weightKg, age: ageYears, sex, goal, activity,
      targetRateKgPerWeek: goal === 'maintain' ? 0 : targetRateKgPerWeek,
      calorieTarget: preview.calorieTarget,
    };

    try {
      await saveProfile(user.uid, profile, true);
      setProfile(profile);
      navigate('/', { replace: true });
    } catch {
      setError('Could not save your profile. Check your connection and try again.');
      setSaving(false);
    }
  }

  return (
    <>
      {/* The target card and the button are pinned to the bottom, so the
          number reacts as the form is filled in without being scrolled away.
          The padding here is what keeps the last card clear of them. */}
      <div className="screen-top mx-auto flex max-w-md flex-col gap-[18px] px-5 pb-[220px]">
        <header className="flex flex-col gap-2">
          <Eyebrow>Set up &middot; 1 minute</Eyebrow>
          <h1 className="display text-[38px] text-ink">Let&rsquo;s find your number</h1>
          <p className="text-[15px] leading-snug text-ink-soft">
            A starting estimate. Milo swaps it for your real maintenance once you have
            logged a couple of weeks.
          </p>
        </header>

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
                onChange={(e) => setCm(e.target.value)}
                placeholder="178"
                aria-label="Height in centimetres"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <UnitInput
                  unit="ft"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  placeholder="5"
                  aria-label="Feet"
                />
                <UnitInput
                  unit="in"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  placeholder="10"
                  aria-label="Inches"
                />
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Weight">
              <UnitInput
                unit={weightUnitLabel(units)}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={units === 'metric' ? '80' : '176'}
                aria-label={`Current weight in ${weightUnitLabel(units)}`}
              />
            </Field>
            <Field label="Age">
              <UnitInput
                unit="yrs"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="30"
                aria-label="Age in years"
              />
            </Field>
          </div>

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
        </Card>

        <Card className="flex flex-col gap-2.5">
          <span className="text-[13px] font-bold text-ink-soft">Activity level</span>
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((value) => (
            <OptionRow
              key={value}
              selected={activity === value}
              label={ACTIVITY_LABELS[value]}
              sub={ACTIVITY_DETAIL[value]}
              onClick={() => setActivity(value)}
            />
          ))}
          <p className="text-xs text-ink-faint">
            A rough starting point. Milo IQ measures your real number once you have two
            weeks of logs.
          </p>
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

          {goal !== 'maintain' && (
            <Field label="Rate per week">
              <Choice
                value={String(rate)}
                onChange={(value) => setRate(Number(value))}
                columns={4}
                options={RATE_OPTIONS[units].map((value) => ({
                  value: String(value),
                  label: `${value} ${weightUnitLabel(units)}`,
                }))}
              />
            </Field>
          )}
        </Card>

        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-10"
        style={{
          background:
            'linear-gradient(rgb(250 250 247 / 0), var(--color-canvas) 18%)',
        }}
      >
        <div
          className="mx-auto flex max-w-md flex-col gap-2.5 px-4 pt-3"
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          <div className="hero-surface flex items-end justify-between gap-3 rounded-card px-[18px] py-4 text-white">
            <div className="flex flex-col gap-1">
              <Eyebrow className="text-[10px] text-brand-pale">Daily target</Eyebrow>
              <p className="flex items-baseline gap-1.5">
                <span className="display tnum text-[40px]">
                  {preview ? preview.calorieTarget.toLocaleString() : '—'}
                </span>
                <span className="text-sm opacity-80">cal</span>
              </p>
            </div>
            <p className="text-right text-xs leading-relaxed opacity-85">
              {preview ? (
                <>
                  Est. maintenance {preview.tdee.toLocaleString()}
                  <br />
                  {preview.clampedToFloor
                    ? 'Held at a safe floor'
                    : goal === 'maintain'
                      ? 'Holding steady'
                      : `${Math.abs(
                          preview.tdee - preview.calorieTarget,
                        ).toLocaleString()} ${goal === 'lose' ? 'below' : 'above'} it`}
                </>
              ) : (
                'Fill in your height, weight and age'
              )}
            </p>
          </div>

          <Button variant="ink" onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Start tracking'}
          </Button>
        </div>
      </div>
    </>
  );
}
