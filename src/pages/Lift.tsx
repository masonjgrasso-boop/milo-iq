import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { createExercise, listExercises, seedStarterExercises } from '../data/workouts';
import { friendlyDayLabel } from '../lib/dates';
import { fromKg, weightUnitLabel } from '../lib/units';
import type { Exercise } from '../lib/types';
import { Button, Card, Field } from '../components/ui';
import { Page } from '../components/Layout';

export function Lift() {
  const { user, profile } = useAuth();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listExercises(user.uid).then(async (found) => {
      // First visit: lay down the starter list so there is something to tap.
      const list = found.length === 0 ? await seedStarterExercises(user.uid) : found;
      if (!cancelled) setExercises([...list].sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!exercises) return [];
    if (!term) return exercises;
    return exercises.filter((exercise) => exercise.name.toLowerCase().includes(term));
  }, [exercises, search]);

  // Things you have actually done rise to the top; the rest stay available.
  const recent = filtered.filter((exercise) => exercise.lastDate);
  const rest = filtered.filter((exercise) => !exercise.lastDate);

  if (!profile) return null;
  const unit = weightUnitLabel(profile.units);

  async function handleAdd() {
    if (!user || !newName.trim()) return;
    const created = await createExercise(user.uid, newName.trim());
    setExercises((current) =>
      [...(current ?? []), created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setNewName('');
    setAdding(false);
  }

  return (
    <Page title="Lift" subtitle="More weight or more reps — both count as progress.">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises"
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
          outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />

      {exercises === null ? (
        <p className="mt-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {recent.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Recent</h2>
              <div className="space-y-2">
                {recent.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} unit={unit} profileUnits={profile.units} />
                ))}
              </div>
            </>
          )}

          <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">
            {recent.length > 0 ? 'All exercises' : 'Exercises'}
          </h2>
          <div className="space-y-2">
            {rest.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} unit={unit} profileUnits={profile.units} />
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="mt-4 text-center text-sm text-slate-500">
              Nothing matches &ldquo;{search}&rdquo;.
            </p>
          )}
        </>
      )}

      <div className="mt-6">
        {adding ? (
          <Card className="space-y-4">
            <Field label="Exercise name">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Sled push"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
                  outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={!newName.trim()}>
                Add
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add a custom exercise
          </Button>
        )}
      </div>
    </Page>
  );
}

function ExerciseRow({ exercise, unit, profileUnits }: {
  exercise: Exercise;
  unit: string;
  profileUnits: 'imperial' | 'metric';
}) {
  return (
    <Link
      to={`/lift/${exercise.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200
        bg-white px-4 py-3 shadow-sm transition hover:border-brand-400"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{exercise.name}</span>
        {exercise.lastDate && (
          <span className="block text-xs text-slate-500">
            {friendlyDayLabel(exercise.lastDate)}
            {exercise.bestE1rmKg
              ? ` · best ${fromKg(exercise.bestE1rmKg, profileUnits).toFixed(0)} ${unit}`
              : ''}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="shrink-0 text-slate-400">
        &rarr;
      </span>
    </Link>
  );
}
