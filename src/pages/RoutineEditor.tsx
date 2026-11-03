// Editing a workout day.
//
// Every change saves straight away — there is no "save" button to forget,
// which matters because routines get tweaked between sets. Each save is one
// write of one small document.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useExercises } from '../hooks/useExercises';
import { deleteRoutine, getRoutine, saveRoutine } from '../data/routines';
import {
  clampSets, DEFAULT_SETS, moveItem, plannedSetCount,
} from '../lib/routines';
import type { Routine, RoutineExercise } from '../lib/types';
import { Button, Card, NumberInput } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import { DragHandle, SortableList } from '../components/SortableList';
import { Page } from '../components/Layout';

export function RoutineEditor() {
  const { routineId } = useParams<{ routineId: string }>();
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const { exercises, addExercise } = useExercises();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user || !routineId) return;
    let cancelled = false;
    getRoutine(user.uid, routineId)
      .then((found) => {
        if (cancelled) return;
        setRoutine(found);
        setLoading(false);
      })
      // Better a message than a spinner that never stops.
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, routineId]);

  /** Applies a change locally, then writes it. Rolls back if the write fails. */
  async function commit(changes: { name?: string; exercises?: RoutineExercise[] }) {
    if (!user || !routine) return;
    const previous = routine;
    setRoutine({ ...routine, ...changes });
    try {
      await saveRoutine(user.uid, routine.id, changes);
    } catch {
      setRoutine(previous);
      notify('Could not save that change. Check your connection.', 'error');
    }
  }

  if (loading) {
    return (
      <Page title="Loading…">
        <Card>
          <p className="text-sm text-slate-400">One moment…</p>
        </Card>
      </Page>
    );
  }

  if (failed) {
    return (
      <Page title="Could not load">
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            That workout day would not load — usually the connection rather than anything
            you did. Nothing has been lost.
          </p>
          <Link to="/lift" className="mt-3 inline-block text-sm font-semibold text-red-800">
            Back to workouts
          </Link>
        </Card>
      </Page>
    );
  }

  if (!routine) {
    return (
      <Page title="Not found">
        <Card>
          <p className="text-sm text-slate-600">That workout day no longer exists.</p>
          <Link to="/lift" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Back to workouts
          </Link>
        </Card>
      </Page>
    );
  }

  const slots = routine.exercises;

  function updateSlot(index: number, changes: Partial<RoutineExercise>) {
    commit({
      exercises: slots.map((slot, i) => (i === index ? { ...slot, ...changes } : slot)),
    });
  }

  async function handleDelete() {
    if (!user || !routine) return;
    try {
      await deleteRoutine(user.uid, routine.id);
      notify(`${routine.name} deleted`);
      navigate('/lift');
    } catch {
      notify('Could not delete that day. Check your connection.', 'error');
    }
  }

  return (
    <Page title={routine.name}>
      <Link
        to="/lift"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; Workouts
      </Link>

      <Card>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Day name</span>
          <input
            value={routine.name}
            onChange={(event) => setRoutine({ ...routine, name: event.target.value })}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next && next !== routine.name) commit({ name: next });
            }}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
              outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </label>
      </Card>

      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Exercises</h2>
        {slots.length > 0 && (
          <span className="text-xs text-slate-500">{plannedSetCount(slots)} sets planned</span>
        )}
      </div>

      {slots.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nothing here yet. Add the exercises you run on this day, with the sets and reps
            you plan to hit.
          </p>
        </Card>
      ) : (
        <SortableList
          items={slots}
          keyOf={(slot) => slot.exerciseId}
          onReorder={(from, to) => commit({ exercises: moveItem(slots, from, to) })}
          renderItem={(slot, handle, dragging) => (
            <SlotRow
              slot={slot}
              handle={handle}
              dragging={dragging}
              onChange={(changes) =>
                updateSlot(slots.findIndex((s) => s.exerciseId === slot.exerciseId), changes)
              }
              onRemove={() =>
                commit({
                  exercises: slots.filter((s) => s.exerciseId !== slot.exerciseId),
                })
              }
            />
          )}
        />
      )}

      <div className="mt-4">
        {picking ? (
          <ExercisePicker
            exercises={exercises ?? []}
            exclude={slots.map((slot) => slot.exerciseId)}
            onCancel={() => setPicking(false)}
            onPick={(exercise) => {
              setPicking(false);
              commit({
                exercises: [
                  ...slots,
                  { exerciseId: exercise.id, name: exercise.name, sets: DEFAULT_SETS },
                ],
              });
            }}
            onCreate={async (name) => {
              const created = await addExercise(name);
              if (!created) return;
              setPicking(false);
              commit({
                exercises: [
                  ...slots,
                  { exerciseId: created.id, name: created.name, sets: DEFAULT_SETS },
                ],
              });
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setPicking(true)}>
            Add an exercise
          </Button>
        )}
      </div>

      {slots.length > 0 && (
        <div className="mt-6">
          <Link
            to={`/lift/do/${routine.id}`}
            className="block w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-base
              font-semibold text-white hover:bg-brand-700"
          >
            Start this workout
          </Link>
        </div>
      )}

      <div className="mt-8">
        {confirmDelete ? (
          <Card className="border-red-200 bg-red-50">
            <p className="text-sm text-red-800">
              Delete <strong>{routine.name}</strong>? Your logged sets are kept — only the
              plan goes.
            </p>
            <div className="mt-3 flex gap-3">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 active:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 text-sm font-medium text-slate-500 hover:text-red-700"
          >
            Delete this workout day
          </button>
        )}
      </div>
    </Page>
  );
}

function SlotRow({ slot, handle, dragging, onChange, onRemove }: {
  slot: RoutineExercise;
  handle: Parameters<typeof DragHandle>[0]['handle'];
  dragging: boolean;
  onChange: (changes: Partial<RoutineExercise>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white px-3 py-3 shadow-sm transition
        ${dragging ? 'border-brand-400 shadow-md' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-1">
        <DragHandle handle={handle} label={slot.name} />
        <Link
          to={`/lift/exercise/${slot.exerciseId}`}
          className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:text-brand-700"
        >
          {slot.name}
        </Link>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${slot.name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg
            text-xl text-slate-400 hover:bg-slate-50 hover:text-red-600"
        >
          &times;
        </button>
      </div>

      {/* Sets only. Reps are what you actually managed, so they are typed in
          the gym rather than planned here. */}
      <div className="mt-2 flex items-center gap-3 pl-8">
        <label className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">Sets</span>
          <span className="w-20">
            <NumberInput
              value={String(slot.sets)}
              min={1}
              onChange={(event) => onChange({ sets: clampSets(Number(event.target.value)) })}
              aria-label={`${slot.name} sets`}
            />
          </span>
        </label>
      </div>
    </div>
  );
}
