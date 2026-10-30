import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { saveProfile } from '../lib/profile';
import { feetInchesToCm, toKg, weightUnitLabel, lbToKg } from '../lib/units';
import { ACTIVITY_LABELS, calculateCalorieTarget } from '../lib/targets';
import type { ActivityLevel, Goal, Sex, UnitSystem, UserProfile } from '../lib/types';
import { Button, Card, Choice, Field, NumberInput } from '../components/ui';

// Weekly rate choices, offered in whatever units the user picked but always
// stored in kg.
const RATE_OPTIONS: Record<UnitSystem, number[]> = {
  imperial: [0.5, 1, 1.5, 2],
  metric: [0.25, 0.5, 0.75, 1],
};
const DEFAULT_RATE: Record<UnitSystem, number> = { imperial: 1, metric: 0.5 };

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
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Let&rsquo;s set you up</h1>
      <p className="mt-1 text-slate-600">
        A few quick answers. You can change any of them later.
      </p>

      <div className="mt-6 space-y-4">
        <Card>
          <Field label="Units">
            <Choice
              value={units}
              onChange={changeUnits}
              options={[
                { value: 'imperial', label: 'lb / ft-in' },
                { value: 'metric', label: 'kg / cm' },
              ]}
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          {units === 'metric' ? (
            <Field label="Height">
              <NumberInput value={cm} onChange={(e) => setCm(e.target.value)} placeholder="178" />
            </Field>
          ) : (
            <Field label="Height">
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  placeholder="5"
                  aria-label="Feet"
                />
                <NumberInput
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  placeholder="10"
                  aria-label="Inches"
                />
              </div>
            </Field>
          )}

          <Field label={`Current weight (${weightUnitLabel(units)})`}>
            <NumberInput
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={units === 'metric' ? '80' : '176'}
            />
          </Field>

          <Field label="Age">
            <NumberInput value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" />
          </Field>

          <Field label="Sex" hint="Used only for the calorie formula.">
            <Choice
              value={sex}
              onChange={setSex}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
          </Field>
        </Card>

        <Card>
          <Field
            label="Typical activity"
            hint="A rough starting point. Milo IQ measures your real number once you have two weeks of logs."
          >
            <Choice
              value={activity}
              onChange={setActivity}
              columns={1}
              options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((value) => ({
                value,
                label: ACTIVITY_LABELS[value],
              }))}
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          <Field label="Goal">
            <Choice
              value={goal}
              onChange={setGoal}
              columns={3}
              options={[
                { value: 'lose', label: 'Lose' },
                { value: 'maintain', label: 'Maintain' },
                { value: 'gain', label: 'Gain' },
              ]}
            />
          </Field>

          {goal !== 'maintain' && (
            <Field label={`Target rate (${weightUnitLabel(units)} per week)`}>
              <Choice
                value={String(rate)}
                onChange={(value) => setRate(Number(value))}
                columns={4}
                options={RATE_OPTIONS[units].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
              />
            </Field>
          )}
        </Card>

        {preview && (
          <Card className="border-brand-200 bg-brand-50">
            <p className="text-sm font-medium text-brand-700">Your starting daily target</p>
            <p className="mt-1 text-3xl font-bold text-brand-700">
              {preview.calorieTarget.toLocaleString()}{' '}
              <span className="text-lg font-semibold">cal</span>
            </p>
            {preview.clampedToFloor && (
              <p className="mt-2 text-sm text-brand-700">
                That rate would push you below a safe intake, so your target is set at the
                floor instead. A slower rate will feel much better.
              </p>
            )}
          </Card>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Start tracking'}
        </Button>

        {!valid && (
          <p className="text-center text-xs text-slate-500">
            Fill in your height, weight and age to continue.
          </p>
        )}
      </div>
    </div>
  );
}
