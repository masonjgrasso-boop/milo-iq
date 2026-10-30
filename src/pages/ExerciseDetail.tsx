import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { getExercise, getSession, listSessions, saveSession } from '../data/workouts';
import { sessionBests, tryEstimateOneRepMax, type WorkoutSet } from '../lib/strength';
import { friendlyDayLabel, shortDateLabel, todayKey } from '../lib/dates';
import { fromKg, toKg, weightUnitLabel } from '../lib/units';
import type { Exercise, WorkoutSession } from '../lib/types';
import { Button, Card, NumberInput } from '../components/ui';
import { StrengthChart, type StrengthPoint } from '../components/charts';
import { Page } from '../components/Layout';

interface DraftSet {
  weight: string;
  reps: string;
}

const emptySet: DraftSet = { weight: '', reps: '' };

export function ExerciseDetail() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const { user, profile } = useAuth();
  const notify = useToast();
  const date = todayKey();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [draft, setDraft] = useState<DraftSet[]>([emptySet]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user || !exerciseId || !profile) return;
    let cancelled = false;

    (async () => {
      const [found, history, todaySession] = await Promise.all([
        getExercise(user.uid, exerciseId),
        listSessions(user.uid, exerciseId),
        getSession(user.uid, exerciseId, date),
      ]);
      if (cancelled) return;

      setExercise(found);
      setSessions(history);

      // Prefill from today if it is already underway, otherwise from the last
      // session, so the common case is "same as last time, tap save".
      const source = todaySession?.sets ?? found?.lastSets ?? [];
      setDraft(
        source.length > 0
          ? source.map((set) => ({
              weight: String(Number(fromKg(set.weightKg, profile.units).toFixed(1))),
              reps: String(set.reps),
            }))
          : [emptySet],
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, exerciseId, date, profile]);

  if (!profile) return null;
  const unit = weightUnitLabel(profile.units);

  const parsedSets: WorkoutSet[] = draft
    .map((set) => ({ weightKg: toKg(Number(set.weight), profile.units), reps: Number(set.reps) }))
    .filter((set) => Number.isFinite(set.weightKg) && set.weightKg >= 0 && set.reps >= 1);

  const points: StrengthPoint[] = sessionBests(
    sessions.map((session) => ({ date: session.date, sets: session.sets })),
  ).map((point) => ({
    label: shortDateLabel(point.date),
    e1rm: Number(fromKg(point.e1rmKg, profile.units).toFixed(1)),
  }));

  function updateSet(index: number, changes: Partial<DraftSet>) {
    setSaved(false);
    setDraft((current) =>
      current.map((set, i) => (i === index ? { ...set, ...changes } : set)),
    );
  }

  async function handleSave() {
    if (!user || !exercise || parsedSets.length === 0) return;
    setSaving(true);
    try {
      const session = await saveSession(user.uid, exercise, date, parsedSets);
      setSessions((current) => [
        ...current.filter((item) => item.date !== date),
        session,
      ].sort((a, b) => a.date.localeCompare(b.date)));
      setSaved(true);
      notify(
        `Saved ${parsedSets.length} ${parsedSets.length === 1 ? 'set' : 'sets'} of ${exercise.name}`,
      );
    } catch {
      notify('Could not save that workout. Check your connection.', 'error');
    } finally {
      setSaving(false);
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

  if (!exercise) {
    return (
      <Page title="Not found">
        <Card>
          <p className="text-sm text-slate-600">That exercise no longer exists.</p>
          <Link to="/lift" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Back to exercises
          </Link>
        </Card>
      </Page>
    );
  }

  const lastLabel = exercise.lastDate ? friendlyDayLabel(exercise.lastDate) : null;

  return (
    <Page title={exercise.name}>
      <Link
        to="/lift"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; All exercises
      </Link>

      {lastLabel && exercise.lastSets && exercise.lastSets.length > 0 && (
        <Card className="mb-4 bg-slate-50">
          <p className="text-xs font-medium text-slate-500">Last time ({lastLabel})</p>
          <p className="mt-1 text-sm text-slate-700">
            {exercise.lastSets
              .map((set) => `${fromKg(set.weightKg, profile.units).toFixed(0)}${unit} x ${set.reps}`)
              .join(' · ')}
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span className="w-8">Set</span>
          <span className="flex-1">Weight ({unit})</span>
          <span className="flex-1">Reps</span>
          <span className="w-16 text-right">Est. 1RM</span>
        </div>

        {draft.map((set, index) => {
          const e1rm = tryEstimateOneRepMax(
            toKg(Number(set.weight), profile.units),
            Number(set.reps),
          );
          return (
            <div key={index} className="flex items-center gap-3">
              <span className="w-8 text-sm font-medium text-slate-400">{index + 1}</span>
              <div className="flex-1">
                <NumberInput
                  value={set.weight}
                  onChange={(event) => updateSet(index, { weight: event.target.value })}
                  aria-label={`Set ${index + 1} weight`}
                />
              </div>
              <div className="flex-1">
                <NumberInput
                  value={set.reps}
                  onChange={(event) => updateSet(index, { reps: event.target.value })}
                  aria-label={`Set ${index + 1} reps`}
                />
              </div>
              <span className="w-16 text-right text-sm font-semibold text-slate-700">
                {e1rm === null ? '—' : fromKg(e1rm, profile.units).toFixed(0)}
              </span>
            </div>
          );
        })}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={() => setDraft((current) => [...current, emptySet])}>
            Add set
          </Button>
          {draft.length > 1 && (
            <Button
              variant="secondary"
              onClick={() => setDraft((current) => current.slice(0, -1))}
            >
              Remove last
            </Button>
          )}
        </div>

        <Button onClick={handleSave} disabled={parsedSets.length === 0 || saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : `Save ${friendlyDayLabel(date).toLowerCase()}`}
        </Button>
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Estimated 1RM over time</h2>
      <Card>
        {points.length >= 2 ? (
          <StrengthChart data={points} unit={unit} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">
            Log this exercise on two or more days to see your progress line.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Each point is your best set that session, converted to an estimated one-rep max.
          Adding reps at the same weight moves the line up just as adding weight does.
        </p>
      </Card>
    </Page>
  );
}
