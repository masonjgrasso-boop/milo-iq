// Picking an exercise: search, with the ones you actually do at the top.
//
// A starter list of twenty-two plus whatever you have added is too long to
// scroll in a gym, so what you lifted most recently comes first and the search
// box narrows everything. Anything missing can be typed in on the spot.

import { useMemo, useState } from 'react';
import type { Exercise } from '../lib/types';
import { Button } from './ui';

export function ExercisePicker({ exercises, exclude = [], onPick, onCreate, onCancel }: {
  exercises: Exercise[];
  /** Ids already in the list, so they are not offered twice. */
  exclude?: string[];
  onPick: (exercise: Exercise) => void;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');

  const { recent, rest } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const available = exercises.filter(
      (exercise) =>
        !exclude.includes(exercise.id) &&
        (term === '' || exercise.name.toLowerCase().includes(term)),
    );
    return {
      // Most recently lifted first — that is what you are most likely to want.
      recent: available
        .filter((exercise) => exercise.lastDate)
        .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
        .slice(0, 6),
      rest: available
        .filter((exercise) => !exercise.lastDate)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [exercises, exclude, search]);

  const typed = search.trim();
  const exactExists = exercises.some(
    (exercise) => exercise.name.toLowerCase() === typed.toLowerCase(),
  );

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises"
        autoFocus
        className="w-full rounded-xl border border-line-in px-3 py-2.5 text-ink
          outline-none focus:border-brand focus:ring-2 focus:ring-brand-pill"
      />

      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {recent.length > 0 && (
          <>
            <p className="px-1 pt-1 pb-0.5 text-xs font-semibold text-ink-mute">Recent</p>
            {recent.map((exercise) => (
              <PickRow key={exercise.id} exercise={exercise} onPick={onPick} />
            ))}
          </>
        )}

        {rest.length > 0 && (
          <>
            {recent.length > 0 && (
              <p className="px-1 pt-3 pb-0.5 text-xs font-semibold text-ink-mute">
                All exercises
              </p>
            )}
            {rest.map((exercise) => (
              <PickRow key={exercise.id} exercise={exercise} onPick={onPick} />
            ))}
          </>
        )}

        {recent.length === 0 && rest.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-mute">
            {typed ? `Nothing matches “${typed}”.` : 'Nothing left to add.'}
          </p>
        )}
      </div>

      {typed !== '' && !exactExists && (
        <button
          type="button"
          onClick={() => onCreate(typed)}
          className="mt-2 w-full rounded-xl border border-brand bg-brand-wash px-4 py-3
            text-left text-sm font-semibold text-brand hover:bg-brand-pill"
        >
          Add &ldquo;{typed}&rdquo; as a new exercise
        </button>
      )}

      <div className="mt-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PickRow({ exercise, onPick }: { exercise: Exercise; onPick: (e: Exercise) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(exercise)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3
        text-left hover:bg-muted"
    >
      <span className="truncate text-sm font-medium text-ink">{exercise.name}</span>
      <span aria-hidden="true" className="shrink-0 text-ink-off">
        +
      </span>
    </button>
  );
}
