// The Workouts tab: your days, in order, with the next one you are due for.
//
// Deciding what to train is meant to happen once, when the routine is written.
// So this screen answers one question — what am I doing today — and gets out
// of the way.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { createRoutine, listRoutines, reorderRoutines } from '../data/routines';
import { friendlyDayLabel } from '../lib/dates';
import { nextDueRoutine, plannedSetCount, sortRoutines } from '../lib/routines';
import type { Routine } from '../lib/types';
import { Button, Card } from '../components/ui';
import { DragHandle, SortableList } from '../components/SortableList';
import { Page } from '../components/Layout';

export function Workouts() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listRoutines(user.uid)
      .then((found) => {
        if (!cancelled) setRoutines(sortRoutines(found));
      })
      // Better a message than a spinner that never stops.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const due = routines ? nextDueRoutine(routines) : null;

  async function handleCreate() {
    if (!user || !name.trim() || !routines) return;
    try {
      const created = await createRoutine(user.uid, name.trim(), routines);
      setRoutines(sortRoutines([...routines, created]));
      setName('');
      setCreating(false);
      navigate(`/lift/day/${created.id}`);
    } catch {
      notify('Could not create that workout day. Check your connection.', 'error');
    }
  }

  async function handleReorder(from: number, to: number) {
    if (!user || !routines) return;
    const ordered = [...routines];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    // Show the new order at once; the write is small and rarely fails.
    setRoutines(ordered.map((routine, index) => ({ ...routine, order: index })));
    try {
      await reorderRoutines(user.uid, ordered);
    } catch {
      setRoutines(routines);
      notify('Could not save that order. Check your connection.', 'error');
    }
  }

  return (
    <Page title="Workouts" subtitle="Set a day up once, then just turn up and lift.">
      {failed ? (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            Your workout days would not load — that is usually the connection. Nothing has
            been lost; pull the page down to try again.
          </p>
        </Card>
      ) : routines === null ? (
        <p className="mt-6 text-center text-sm text-slate-400">Loading…</p>
      ) : routines.length === 0 ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">No workout days yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Make a day for each session you run — &ldquo;Day 1: Legs&rdquo;, &ldquo;Day 2:
            Back &amp; Bi&rdquo; — add the exercises once, and every workout after that is
            just typing weight and reps.
          </p>
        </Card>
      ) : (
        <SortableList
          items={routines}
          keyOf={(routine) => routine.id}
          onReorder={handleReorder}
          renderItem={(routine, handle, dragging) => (
            <RoutineRow
              routine={routine}
              handle={handle}
              dragging={dragging}
              isDue={routine.id === due?.id}
            />
          )}
        />
      )}

      <div className="mt-6">
        {creating ? (
          <Card className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Name this day
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate();
                }}
                placeholder="Day 1: Legs"
                autoFocus
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
                  outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim()}>
                Create
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            New workout day
          </Button>
        )}
      </div>

      <Card className="mt-6">
        <Link to="/lift/exercises" className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              All exercises &amp; progress
            </span>
            <span className="block text-xs text-slate-500">
              Every lift you have done, with its strength graph
            </span>
          </span>
          <span aria-hidden="true" className="text-slate-400">
            &rarr;
          </span>
        </Link>
      </Card>
    </Page>
  );
}

function RoutineRow({ routine, handle, dragging, isDue }: {
  routine: Routine;
  handle: Parameters<typeof DragHandle>[0]['handle'];
  dragging: boolean;
  isDue: boolean;
}) {
  const count = routine.exercises.length;
  const sets = plannedSetCount(routine.exercises);

  return (
    <div
      className={`flex items-center gap-1 rounded-2xl border bg-white px-3 py-3 shadow-sm
        transition ${dragging ? 'border-brand-400 shadow-md' : 'border-slate-200'}
        ${isDue && !dragging ? 'border-brand-400 ring-2 ring-brand-100' : ''}`}
    >
      <DragHandle handle={handle} label={routine.name} />

      <Link to={`/lift/do/${routine.id}`} className="min-w-0 flex-1 py-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-slate-900">{routine.name}</span>
          {isDue && (
            <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs
              font-semibold text-white">
              Up next
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {count === 0
            ? 'No exercises yet — tap edit to add some'
            : `${count} ${count === 1 ? 'exercise' : 'exercises'} · ${sets} sets`}
          {routine.lastDoneDate && ` · last ${friendlyDayLabel(routine.lastDoneDate).toLowerCase()}`}
        </span>
      </Link>

      <Link
        to={`/lift/day/${routine.id}`}
        className="flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold
          text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        Edit
      </Link>
    </div>
  );
}
