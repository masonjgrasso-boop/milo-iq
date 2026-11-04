// The calorie calculator a visitor can use before signing in.
//
// It runs the same calculateCalorieTarget the onboarding estimate uses, so the
// number a visitor sees here is the number the app would start them on. It
// saves nothing: everything lives in this component's state and goes when it
// closes.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACTIVITY_LABELS, calculateCalorieTarget } from '../lib/targets';
import {
  gentlerRate, rateConcern, rateToKgPerWeek, safeMinimum, type RatePeriod,
} from '../lib/rate';
import { feetInchesToCm, toKg, weightUnitLabel } from '../lib/units';
import type { ActivityLevel, Goal, Sex, UnitSystem } from '../lib/types';
import { Button, Card, Eyebrow, Field, NoteBox, OptionRow, Segmented, Stat, UnitInput } from './ui';

const PERIOD_WORDS: Record<RatePeriod, string> = { week: 'a week', month: 'a month' };

export function CalorieCalculator({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  const [units, setUnits] = useState<UnitSystem>('imperial');
  const [feet, setFeet] = useState('5');
  const [inches, setInches] = useState('10');
  const [cm, setCm] = useState('178');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [goal, setGoal] = useState<Goal>('lose');
  const [rate, setRate] = useState('');
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>('week');

  // Escape closes it, and the panel takes focus so a keyboard lands inside.
  useEffect(() => {
    panel.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the page behind from scrolling under the sheet.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function changeUnits(next: UnitSystem) {
    setUnits(next);
    setWeight('');
    // A rate in pounds means something else in kilos, so it goes too.
    setRate('');
  }

  const heightCm = units === 'metric'
    ? Number(cm)
    : feetInchesToCm(Number(feet) || 0, Number(inches) || 0);
  const weightKg = toKg(Number(weight), units);
  const ageYears = Number(age);

  // Maintenance needs only the body, so it appears as soon as that is in.
  const bodyValid =
    heightCm > 50 && heightCm < 280 &&
    weightKg > 20 && weightKg < 400 &&
    ageYears >= 13 && ageYears <= 120;

  const rateKgPerWeek = rateToKgPerWeek(Number(rate), ratePeriod, units);

  const result = bodyValid
    ? calculateCalorieTarget({
        weightKg,
        heightCm,
        age: ageYears,
        sex,
        activity,
        goal,
        targetRateKgPerWeek: goal === 'maintain' ? 0 : rateKgPerWeek,
      })
    : null;

  // The daily goal waits for a rate, because without one it would just be
  // maintenance wearing the word "goal".
  const goalReady = result !== null && (goal === 'maintain' || rateKgPerWeek > 0);

  const concern = result === null
    ? 'none'
    : rateConcern({ rateKgPerWeek, weightKg, clampedToFloor: result.clampedToFloor });

  const unit = weightUnitLabel(units);
  const period = PERIOD_WORDS[ratePeriod];
  const gentler = bodyValid ? gentlerRate(weightKg, ratePeriod, units) : 0;
  const losing = goal === 'lose';

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/60 lg:items-center lg:p-6"
      onClick={onClose}
    >
      {/* A bottom sheet on a phone, a centred dialog from lg up. */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calculator-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-canvas
          p-5 outline-none lg:max-h-[88vh] lg:rounded-card lg:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Eyebrow>No sign-in needed</Eyebrow>
            <h2 id="calculator-title" className="display text-[32px] text-ink">
              Your calories
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the calculator"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input
              border border-line-in bg-surface text-lg text-ink transition hover:bg-muted"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-4">
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
                  aria-label={`Weight in ${weightUnitLabel(units)}`}
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
              <Field label={losing ? 'How much to lose' : 'How much to gain'}>
                <div className="grid grid-cols-2 gap-2.5">
                  <UnitInput
                    unit={unit}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder={units === 'metric' ? '0.5' : '1'}
                    aria-label={`How much to ${goal} in ${unit} ${period}`}
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

          {result ? (
            <div className="flex flex-col gap-4">
              <div className="hero-surface flex flex-col gap-1.5 rounded-hero p-5 text-white">
                <Eyebrow className="text-[10px] text-brand-pale">
                  Maintenance calories
                </Eyebrow>
                <p className="flex items-baseline gap-2">
                  <span className="display tnum text-[46px]">
                    {result.tdee.toLocaleString()}
                  </span>
                  <span className="text-sm opacity-80">cal / day</span>
                </p>
                <p className="text-[13px] opacity-85">
                  What your body burns on a normal day, so eating this much holds your
                  weight where it is.
                </p>
              </div>

              {goalReady ? (
                <Card className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-bold text-ink-mute">Your daily goal</p>
                    <p className="flex items-baseline gap-2">
                      <span className="display tnum text-[38px] text-brand">
                        {result.calorieTarget.toLocaleString()}
                      </span>
                      <span className="text-sm text-ink-mute">cal / day</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Maintenance" value={result.tdee.toLocaleString()} />
                    <Stat
                      label={goal === 'maintain' ? 'Holding steady' : 'Daily change'}
                      value={
                        goal === 'maintain'
                          ? '0'
                          : `${losing ? '−' : '+'}${Math.abs(
                              result.tdee - result.calorieTarget,
                            ).toLocaleString()}`
                      }
                      tone={goal === 'maintain' ? 'neutral' : 'good'}
                    />
                  </div>

                  {goal === 'maintain' && (
                    <p className="text-[13px] text-ink-mute">
                      No deficit or surplus — this is maintenance.
                    </p>
                  )}

                  {concern === 'none' && goal !== 'maintain' && (
                    <p className="text-[13px] text-ink-mute">
                      At {rate} {unit} {period}, that is the deficit your goal asks for.
                    </p>
                  )}

                  {/* Gentle, and specific: both notes name a rate to try instead. */}
                  {concern === 'below-minimum' && (
                    <NoteBox tone="cream">
                      {losing ? 'Losing' : 'Gaining'} {rate} {unit} {period} would put you
                      under {safeMinimum(sex).toLocaleString()} calories a day, which is
                      lower than we would suggest going. Your goal is being held at{' '}
                      {result.calorieTarget.toLocaleString()} instead. Around {gentler}{' '}
                      {unit} {period} is a pace you can actually hold.
                    </NoteBox>
                  )}

                  {concern === 'aggressive' && (
                    <NoteBox tone="cream">
                      That is more than 1% of your body weight a week. It works, but it is
                      hard to stick to and more of the change comes from muscle. Around{' '}
                      {gentler} {unit} {period} tends to go better.
                    </NoteBox>
                  )}
                </Card>
              ) : (
                <Card tone="muted">
                  <p className="text-sm text-ink-soft">
                    Enter how much you want to {goal} and your daily goal appears here.
                  </p>
                </Card>
              )}

              <Card tone="cream" className="flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-ink-soft">
                  <strong className="text-ink">This is an estimate.</strong> Track with
                  Milo IQ and it calculates your real number from your own data.
                </p>
                <Link
                  to="/signin"
                  className="flex h-[52px] items-center justify-center rounded-btn bg-brand
                    text-base font-bold text-white transition hover:bg-brand-hi"
                >
                  Get started free
                </Link>
              </Card>
            </div>
          ) : (
            <Card tone="muted">
              <p className="text-sm text-ink-soft">
                Fill in your height, weight and age to see your number.
              </p>
            </Card>
          )}

          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
