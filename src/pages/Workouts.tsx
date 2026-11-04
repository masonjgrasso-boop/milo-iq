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
import { Button, Card, Dot, HeroCard, Pill, TextInput } from '../components/ui';
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
    <Page
      eyebrow="Lifting"
      title="Workouts"
      subtitle="Set a day up once, then just turn up and lift."
    >
      {failed ? (
        <Card tone="cream">
          <p className="text-sm text-danger">
            Your workout days would not load — that is usually the connection. Nothing has
            been lost; pull the page down to try again.
          </p>
        </Card>
      ) : routines === null ? (
        <p className="mt-6 text-center text-sm text-ink-ghost">Loading…</p>
      ) : routines.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold text-ink">No workout days yet</h2>
          <p className="text-sm text-ink-soft">
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

      {creating ? (
        <Card className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-ink-soft">Name this day</span>
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreate();
              }}
              placeholder="Day 1: Legs"
              autoFocus
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

      <Link
        to="/lift/exercises"
        className="flex items-center justify-between gap-3 rounded-card border border-line
          bg-surface p-[18px] shadow-card transition hover:bg-muted"
      >
        <span className="flex flex-col gap-1">
          <span className="text-base font-extrabold text-ink">
            All exercises &amp; progress
          </span>
          <span className="text-[13px] text-ink-mute">
            Every lift you have done, with its strength graph
          </span>
        </span>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
            bg-brand-wash font-extrabold text-brand"
        >
          &rarr;
        </span>
      </Link>
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
  const detail =
    count === 0
      ? 'No exercises yet — tap Edit to add some'
      : `${count} ${count === 1 ? 'exercise' : 'exercises'} · ${sets} sets`;

  // The day that is up next gets the dark card and a Start button, because it
  // is the one thing this screen exists to get you into.
  if (isDue && !dragging) {
    return (
      <HeroCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <Pill tone="onHero">
              <Dot />
              Up next
            </Pill>
            <span className="display truncate text-[36px]">{routine.name}</span>
            <span className="text-sm opacity-85">{detail}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DragHandle
              handle={handle}
              label={routine.name}
              className="text-white/60 hover:text-white"
            />
            <Link
              to={`/lift/day/${routine.id}`}
              className="flex h-[34px] items-center rounded-chip border border-white/30
                px-3.5 text-[13px] font-bold text-white transition hover:bg-white/10"
            >
              Edit
            </Link>
          </div>
        </div>

        <Link
          to={`/lift/do/${routine.id}`}
          className="flex h-[50px] items-center justify-center rounded-btn bg-surface
            text-base font-extrabold text-brand transition hover:bg-canvas"
        >
          Start {routine.name}
        </Link>
      </HeroCard>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-card border bg-surface px-3 py-3 shadow-card
        transition ${dragging ? 'border-brand' : 'border-line'}`}
    >
      <DragHandle handle={handle} label={routine.name} />

      <Link to={`/lift/do/${routine.id}`} className="min-w-0 flex-1 py-1">
        <span className="block truncate font-bold text-ink">{routine.name}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-mute">
          {detail}
          {routine.lastDoneDate && ` · last ${friendlyDayLabel(routine.lastDoneDate).toLowerCase()}`}
        </span>
      </Link>

      <Link
        to={`/lift/day/${routine.id}`}
        className="flex h-11 shrink-0 items-center rounded-chip px-3 text-sm font-bold
          text-ink-mute transition hover:bg-muted hover:text-ink-soft"
      >
        Edit
      </Link>
    </div>
  );
}
