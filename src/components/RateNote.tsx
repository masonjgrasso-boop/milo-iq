// The gentle word about a rate, when one is warranted.
//
// Two things get a note: a rate so fast it would push the daily target under
// the safe floor, and a rate over 1% of body weight a week. Both name a
// slower pace to try instead, because "that is too fast" without a number is
// not advice.
//
// Shared by the landing-page calculator and the change-goal form so the
// wording cannot drift between the two. Someone who worked out a rate before
// signing up should meet the same sentence when they change their goal later.

import { gentlerRate, safeMinimum, PERIOD_WORDS, type RateConcern, type RatePeriod } from '../lib/rate';
import { weightUnitLabel } from '../lib/units';
import type { Goal, Sex, UnitSystem } from '../lib/types';
import { NoteBox } from './ui';

export function RateNote({
  concern, goal, rate, units, period, sex, weightKg, calorieTarget,
}: {
  concern: RateConcern;
  goal: Goal;
  /** The rate exactly as typed, so the note quotes it back unchanged. */
  rate: string;
  units: UnitSystem;
  period: RatePeriod;
  sex: Sex;
  weightKg: number;
  /** The target that was actually set, which may be the floor. */
  calorieTarget: number;
}) {
  if (concern === 'none') return null;

  const unit = weightUnitLabel(units);
  const when = PERIOD_WORDS[period];
  const gentler = gentlerRate(weightKg, period, units);

  if (concern === 'below-minimum') {
    return (
      <NoteBox tone="cream">
        {goal === 'lose' ? 'Losing' : 'Gaining'} {rate} {unit} {when} would put you under{' '}
        {safeMinimum(sex).toLocaleString()} calories a day, which is lower than we would
        suggest going. Your goal is being held at {calorieTarget.toLocaleString()} instead.
        Around {gentler} {unit} {when} is a pace you can actually hold.
      </NoteBox>
    );
  }

  return (
    <NoteBox tone="cream">
      That is more than 1% of your body weight a week. It works, but it is hard to stick
      to and more of the change comes from muscle. Around {gentler} {unit} {when} tends to
      go better.
    </NoteBox>
  );
}
