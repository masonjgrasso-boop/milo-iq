// Doing the workout.
//
// The plan is already written, so this screen is just the numbers. Every
// exercise and every set is laid out before you start; you type the weight,
// type the reps, and tap the tick.
//
// Both boxes start empty and stay empty. Lifters change the load every
// session, and a figure nobody corrected quietly poisons the progress graph.
// Last session's numbers are shown as a reference line underneath instead,
// which is what you actually want to beat.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useExercises } from '../hooks/useExercises';
import { getRoutine, markRoutineDone, saveRoutine } from '../data/routines';
import { getSession, saveSession } from '../data/workouts';
import { friendlyDayLabel, todayKey } from '../lib/dates';
import { DEFAULT_SETS } from '../lib/routines';
import { type WorkoutSet } from '../lib/strength';
import { fromKg, toKg, weightUnitLabel } from '../lib/units';
import { canLogSet, isNewBest, summarizeWorkout, type WorkoutSummary } from '../lib/workout';
import type { Exercise, Routine, RoutineExercise, UserProfile } from '../lib/types';
import { Button, Card, NumberInput } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { Page } from '../components/Layout';

interface Row {
  weight: string;
  reps: string;
  /** Set once the tick is tapped, which is also when it is written. */
  logged: boolean;
  /** Shown the moment a logged set beats everything before it. */
  isBest: boolean;
}

interface Slot {
  exerciseId: string;
  name: string;
  rows: Row[];
  /** Best estimated 1RM before this set, updated as sets land. */
  bestKg: number;
  /** Best before the workout started, for the finish summary. */
  startingBestKg: number;
  lastSets?: WorkoutSet[];
  lastDate?: string;
  /** True for an exercise added or swapped in for today only. */
  adHoc: boolean;
}

const emptyRow: Row = { weight: '', reps: '', logged: false, isBest: false };

const blankRows = (count: number): Row[] =>
  Array.from({ length: Math.max(1, count) }, () => ({ ...emptyRow }));

export function WorkoutRunner() {
  const { routineId } = useParams<{ routineId: string }>();
  const { user, profile } = useAuth();

  if (!profile) return null;

  return <Runner routineId={routineId} uid={user?.uid} profile={profile} />;
}

function Runner({ routineId, uid, profile }: {
  routineId?: string;
  uid?: string;
  profile: UserProfile;
}) {
  const notify = useToast();
  const { exercises, addExercise, failed: libraryFailed } = useExercises();
  const date = todayKey();
  const unit = weightUnitLabel(profile.units);

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Bumped by "try again", which is what makes the load effect run afresh. */
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState<{ replacing?: string } | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [savingRoutine, setSavingRoutine] = useState(false);

  // The layout is built once.
  //
  // This is a ref rather than state on purpose. The exercise list changes
  // identity whenever a custom exercise is added, so without a guard the slots
  // would be rebuilt and sets in progress lost — but setting a *state* guard
  // part-way through re-runs this effect, whose cleanup then cancels the very
  // continuation that clears the spinner. A ref changes nothing on screen, so
  // the load always finishes.
  const laidOut = useRef(false);

  useEffect(() => {
    if (!uid || !routineId || !exercises || laidOut.current) return;
    laidOut.current = true;
    let cancelled = false;

    (async () => {
      try {
        const found = await getRoutine(uid, routineId);
        if (cancelled) return;
        if (!found) {
          setRoutine(null);
          setLoading(false);
          return;
        }

        const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

        // Anything already logged today is restored, so closing the app mid
        // workout does not lose the sets that are done.
        const existing = await Promise.all(
          found.exercises.map((slot) => getSession(uid, slot.exerciseId, date)),
        );
        if (cancelled) return;

        setRoutine(found);
        setSlots(
          found.exercises.map((slot, index) =>
            toSlot(slot, byId.get(slot.exerciseId), existing[index]?.sets ?? [], profile),
          ),
        );
        setLoading(false);
      } catch {
        if (cancelled) return;
        // Never spin forever: say what happened and offer another go.
        laidOut.current = false;
        setFailed(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, routineId, exercises, date, profile, attempt]);

  const logged = useMemo(
    () => slots.reduce((sum, slot) => sum + slot.rows.filter((row) => row.logged).length, 0),
    [slots],
  );

  // Whether today's line-up differs from the written plan.
  const changedFromRoutine = useMemo(() => {
    if (!routine) return false;
    const planned = routine.exercises.map((slot) => slot.exerciseId).join('|');
    return slots.map((slot) => slot.exerciseId).join('|') !== planned;
  }, [routine, slots]);

  function patchSlot(exerciseId: string, change: (slot: Slot) => Slot) {
    setSlots((current) =>
      current.map((slot) => (slot.exerciseId === exerciseId ? change(slot) : slot)),
    );
  }

  /** Writes whichever of an exercise's rows are ticked. */
  async function persist(slot: Slot, rows: Row[]) {
    if (!uid || !exercises) return;
    const exercise = exercises.find((item) => item.id === slot.exerciseId);
    if (!exercise) return;
    const sets = rows.filter((row) => row.logged).map((row) => parseRow(row, profile));
    await saveSession(uid, exercise, date, sets);
  }

  async function toggleRow(slot: Slot, index: number) {
    const row = slot.rows[index];
    const parsed = parseRow(row, profile);

    if (!row.logged && !canLogSet(parsed.weightKg, parsed.reps)) return;

    const nowLogged = !row.logged;
    const best = nowLogged && isNewBest(parsed.weightKg, parsed.reps, slot.bestKg);

    const rows = slot.rows.map((item, i) =>
      i === index ? { ...item, logged: nowLogged, isBest: best } : item,
    );
    const nextBest = nowLogged && best
      ? Math.max(slot.bestKg, parsed.weightKg * (1 + parsed.reps / 30))
      : slot.bestKg;

    patchSlot(slot.exerciseId, (current) => ({ ...current, rows, bestKg: nextBest }));

    try {
      await persist(slot, rows);
      if (best) notify(`New best on ${slot.name}`);
    } catch {
      patchSlot(slot.exerciseId, (current) => ({ ...current, rows: slot.rows }));
      notify('Could not log that set. Check your connection.', 'error');
    }
  }

  async function handleFinish() {
    if (!uid || !routine) return;
    setFinishing(true);
    try {
      await markRoutineDone(uid, routine.id, date);
      setSummary(
        summarizeWorkout(
          slots.map((slot) => ({
            exerciseId: slot.exerciseId,
            name: slot.name,
            sets: slot.rows.filter((row) => row.logged).map((row) => parseRow(row, profile)),
            previousBestKg: slot.startingBestKg,
          })),
        ),
      );
    } catch {
      notify('Could not finish the workout. Check your connection.', 'error');
    } finally {
      setFinishing(false);
    }
  }

  async function handleSaveToRoutine() {
    if (!uid || !routine) return;
    setSavingRoutine(true);
    const exercisesNow: RoutineExercise[] = slots.map((slot) => ({
      exerciseId: slot.exerciseId,
      name: slot.name,
      sets: slot.rows.length,
    }));
    try {
      await saveRoutine(uid, routine.id, { exercises: exercisesNow });
      setRoutine({ ...routine, exercises: exercisesNow });
      setSlots((current) => current.map((slot) => ({ ...slot, adHoc: false })));
      notify('Routine updated');
    } catch {
      notify('Could not update the routine. Check your connection.', 'error');
    } finally {
      setSavingRoutine(false);
    }
  }

  function addSlot(exercise: Exercise, replacing?: string) {
    const fresh = toSlot(
      { exerciseId: exercise.id, name: exercise.name, sets: DEFAULT_SETS },
      exercise,
      [],
      profile,
    );
    fresh.adHoc = true;

    setSlots((current) =>
      replacing
        ? current.map((slot) => (slot.exerciseId === replacing ? fresh : slot))
        : [...current, fresh],
    );
    setPicking(null);
  }

  if (failed || libraryFailed) {
    return (
      <Page title="Could not load">
        <Card className="border-cream-line bg-cream">
          <p className="text-sm text-danger">
            Your workout would not load. That is almost always the connection rather than
            anything you did — nothing has been lost.
          </p>
          <div className="mt-3">
            <Button
              onClick={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </Button>
          </div>
          <Link to="/lift" className="mt-3 inline-block text-sm font-semibold text-danger">
            Back to workouts
          </Link>
        </Card>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page title="Loading…">
        <Card>
          <p className="text-sm text-ink-ghost">Setting up your workout…</p>
        </Card>
      </Page>
    );
  }

  if (!routine) {
    return (
      <Page title="Not found">
        <Card>
          <p className="text-sm text-ink-soft">That workout day no longer exists.</p>
          <Link to="/lift" className="mt-3 inline-block text-sm font-semibold text-brand">
            Back to workouts
          </Link>
        </Card>
      </Page>
    );
  }

  if (summary) {
    return <FinishedCard routine={routine} summary={summary} profile={profile} />;
  }

  return (
    <Page title={routine.name} subtitle={friendlyDayLabel(date)}>
      <Link
        to="/lift"
        className="mb-4 inline-block text-sm font-medium text-ink-mute hover:text-ink-soft"
      >
        &larr; Workouts
      </Link>

      {slots.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            This day has no exercises yet.{' '}
            <Link to={`/lift/day/${routine.id}`} className="font-semibold text-brand">
              Add some
            </Link>{' '}
            and it will be laid out here.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {slots.map((slot) => (
            <ExerciseCard
              key={slot.exerciseId}
              slot={slot}
              unit={unit}
              units={profile.units}
              onToggle={(index) => toggleRow(slot, index)}
              onEdit={(index, changes) =>
                patchSlot(slot.exerciseId, (current) => ({
                  ...current,
                  rows: current.rows.map((row, i) =>
                    i === index ? { ...row, ...changes } : row,
                  ),
                }))
              }
              onAddRow={() =>
                patchSlot(slot.exerciseId, (current) => ({
                  ...current,
                  rows: [...current.rows, { ...emptyRow }],
                }))
              }
              onSwap={() => setPicking({ replacing: slot.exerciseId })}
              onRemove={() =>
                setSlots((current) =>
                  current.filter((item) => item.exerciseId !== slot.exerciseId),
                )
              }
            />
          ))}
        </div>
      )}

      <div className="mt-4">
        {picking ? (
          <ExercisePicker
            exercises={exercises ?? []}
            exclude={slots.map((slot) => slot.exerciseId)}
            onCancel={() => setPicking(null)}
            onPick={(exercise) => addSlot(exercise, picking.replacing)}
            onCreate={async (name) => {
              const created = await addExercise(name);
              if (created) addSlot(created, picking.replacing);
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setPicking({})}>
            Add an exercise for today
          </Button>
        )}
      </div>

      {changedFromRoutine && !picking && (
        <Card className="mt-4 border-brand-pill bg-brand-wash">
          <p className="text-sm text-brand">
            Today&rsquo;s line-up is different from your routine. Keep it for today only, or
            make it the plan from now on.
          </p>
          <div className="mt-3">
            <Button onClick={handleSaveToRoutine} disabled={savingRoutine}>
              {savingRoutine ? 'Saving…' : 'Save change to routine'}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Button onClick={handleFinish} disabled={finishing}>
          {finishing ? 'Finishing…' : `Finish workout (${logged} ${logged === 1 ? 'set' : 'sets'})`}
        </Button>
      </div>
    </Page>
  );
}

/** Builds one running slot from the plan, the exercise cache and today's sets. */
function toSlot(
  planned: RoutineExercise,
  exercise: Exercise | undefined,
  todaysSets: WorkoutSet[],
  profile: UserProfile,
): Slot {
  const done: Row[] = todaysSets.map((set) => ({
    weight: String(Number(fromKg(set.weightKg, profile.units).toFixed(1))),
    reps: String(set.reps),
    logged: true,
    isBest: false,
  }));

  // Enough blank rows to reach the planned count, plus whatever is already done.
  const remaining = Math.max(0, planned.sets - done.length);
  const rows = [...done, ...(remaining > 0 ? blankRows(remaining) : [])];

  return {
    exerciseId: planned.exerciseId,
    name: exercise?.name ?? planned.name,
    rows: rows.length > 0 ? rows : blankRows(1),
    bestKg: exercise?.bestE1rmKg ?? 0,
    startingBestKg: exercise?.bestE1rmKg ?? 0,
    lastSets: exercise?.lastSets,
    lastDate: exercise?.lastDate,
    adHoc: false,
  };
}

/** A row's typed values in kilograms, with blanks as NaN so they fail validation. */
function parseRow(row: Row, profile: UserProfile): WorkoutSet {
  const weight = row.weight.trim() === '' ? Number.NaN : Number(row.weight);
  const reps = row.reps.trim() === '' ? Number.NaN : Number(row.reps);
  return {
    weightKg: Number.isFinite(weight) ? toKg(weight, profile.units) : Number.NaN,
    reps,
  };
}

function ExerciseCard({
  slot, unit, units, onToggle, onEdit, onAddRow, onSwap, onRemove,
}: {
  slot: Slot;
  unit: string;
  units: UserProfile['units'];
  onToggle: (index: number) => void;
  onEdit: (index: number, changes: Partial<Row>) => void;
  onAddRow: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const lastLine =
    slot.lastSets && slot.lastSets.length > 0
      ? slot.lastSets
          .map((set) => `${fromKg(set.weightKg, units).toFixed(0)} x ${set.reps}`)
          .join(', ')
      : null;

  return (
    <Card className="px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/lift/exercise/${slot.exerciseId}`}
            className="block truncate font-semibold text-ink hover:text-brand"
          >
            {slot.name}
          </Link>
          <p className="mt-0.5 text-xs text-ink-mute">
            {lastLine ? `Last time: ${lastLine} ${unit}` : 'First time — set the bar'}
          </p>
        </div>
        {slot.adHoc && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs
            font-medium text-ink-soft">
            Today only
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-mute">
          <span className="w-6">#</span>
          <span className="flex-1">Weight ({unit})</span>
          <span className="flex-1">Reps</span>
          <span className="w-11" />
        </div>

        {slot.rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 text-sm font-medium text-ink-ghost">{index + 1}</span>
            <div className="flex-1">
              <NumberInput
                value={row.weight}
                min={0}
                onChange={(event) => onEdit(index, { weight: event.target.value })}
                aria-label={`${slot.name} set ${index + 1} weight`}
                className={row.logged ? 'bg-muted text-ink-mute' : ''}
              />
            </div>
            <div className="flex-1">
              <NumberInput
                value={row.reps}
                min={1}
                onChange={(event) => onEdit(index, { reps: event.target.value })}
                aria-label={`${slot.name} set ${index + 1} reps`}
                className={row.logged ? 'bg-muted text-ink-mute' : ''}
              />
            </div>
            <LogButton
              logged={row.logged}
              ready={canLogSet(
                row.weight.trim() === '' ? null : Number(row.weight),
                row.reps.trim() === '' ? null : Number(row.reps),
              )}
              label={`${slot.name} set ${index + 1}`}
              onClick={() => onToggle(index)}
            />
          </div>
        ))}

        {slot.rows.some((row) => row.isBest) && (
          <p className="pt-1 text-xs font-semibold text-brand">
            New best on this lift. 🎉
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold">
        <button type="button" onClick={onAddRow} className="py-1.5 text-brand">
          Add a set
        </button>
        <button type="button" onClick={onSwap} className="py-1.5 text-ink-mute">
          Swap exercise
        </button>
        <button type="button" onClick={onRemove} className="py-1.5 text-ink-mute">
          Skip today
        </button>
      </div>
    </Card>
  );
}

/** A big tick. Grey until the row is complete, green once the set is logged. */
function LogButton({ logged, ready, label, onClick }: {
  logged: boolean;
  ready: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!logged && !ready}
      aria-label={logged ? `Undo ${label}` : `Log ${label}`}
      aria-pressed={logged}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border
        text-lg transition disabled:opacity-40 ${
          logged
            ? 'border-brand bg-brand text-white'
            : 'border-line-in bg-white text-ink-ghost'
        }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function FinishedCard({ routine, summary, profile }: {
  routine: Routine;
  summary: WorkoutSummary;
  profile: UserProfile;
}) {
  const unit = weightUnitLabel(profile.units);

  return (
    <Page title="Workout done" subtitle={routine.name}>
      <Card>
        {summary.setsDone === 0 ? (
          <p className="text-sm text-ink-soft">
            Nothing logged this time — no harm done. The streak that matters is the one
            across months, not any single session.
          </p>
        ) : (
          <>
            <p className="text-base font-semibold text-ink">
              {summary.setsDone} {summary.setsDone === 1 ? 'set' : 'sets'} across{' '}
              {summary.exercisesDone}{' '}
              {summary.exercisesDone === 1 ? 'exercise' : 'exercises'}.
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {Math.round(fromKg(summary.totalVolumeKg, profile.units)).toLocaleString()}{' '}
              {unit} moved in total.
            </p>
          </>
        )}

        {summary.newBests.length > 0 && (
          <div className="mt-4 rounded-xl bg-brand-wash p-3">
            <p className="text-sm font-semibold text-brand">
              {summary.newBests.length === 1 ? 'New best' : `${summary.newBests.length} new bests`}
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-brand">
              {summary.newBests.map((best) => (
                <li key={best.name} className="flex justify-between gap-3">
                  <span className="truncate">{best.name}</span>
                  <span className="shrink-0 font-semibold">
                    {fromKg(best.e1rmKg, profile.units).toFixed(0)} {unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Link
          to="/lift"
          className="block w-full rounded-xl bg-brand px-4 py-3 text-center text-base
            font-semibold text-white hover:bg-brand-hi"
        >
          Done
        </Link>
      </div>
    </Page>
  );
}
