// Loading and editing one day's log, keeping the week and month summaries in
// step with every change.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { emptyDay, getDay, saveDay } from '../data/days';
import { refreshSummaries } from '../data/summaries';
import type { DayKey } from '../lib/dates';
import type { DayLog, FoodEntry } from '../lib/types';

export const newEntryId = (): string =>
  // randomUUID needs a secure context; the fallback keeps local HTTP working.
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const totalCalories = (entries: FoodEntry[]): number =>
  entries.reduce((sum, entry) => sum + entry.calories, 0);

export function useDay(date: DayKey) {
  const { user, profile } = useAuth();
  const uid = user?.uid;

  const [day, setDay] = useState<DayLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setDay(null);
    getDay(uid, date).then((loaded) => {
      if (!cancelled) setDay(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, date]);

  const persist = useCallback(
    async (next: DayLog) => {
      if (!uid || !profile) return;
      // Show the change straight away; logging should never feel like waiting.
      setDay(next);
      setSaving(true);
      setError(null);
      try {
        await saveDay(uid, next);
        await refreshSummaries(uid, date, profile.calorieTarget);
      } catch {
        setError('Could not save. Your change is still here — check your connection.');
      } finally {
        setSaving(false);
      }
    },
    [uid, date, profile],
  );

  const addEntry = useCallback(
    (entry: Omit<FoodEntry, 'id'>) => {
      const current = day ?? emptyDay(date);
      const entries = [...current.entries, { ...entry, id: newEntryId() }];
      return persist({ ...current, entries, calories: totalCalories(entries) });
    },
    [day, date, persist],
  );

  const removeEntry = useCallback(
    (entryId: string) => {
      const current = day ?? emptyDay(date);
      const entries = current.entries.filter((entry) => entry.id !== entryId);
      return persist({ ...current, entries, calories: totalCalories(entries) });
    },
    [day, date, persist],
  );

  const setWeight = useCallback(
    (weightKg: number | undefined) => {
      const current = day ?? emptyDay(date);
      const next = { ...current };
      if (weightKg === undefined) delete next.weightKg;
      else next.weightKg = weightKg;
      return persist(next);
    },
    [day, date, persist],
  );

  const setRuleValue = useCallback(
    (ruleId: string, value: boolean | number | undefined) => {
      const current = day ?? emptyDay(date);
      const rules = { ...(current.rules ?? {}) };
      if (value === undefined) delete rules[ruleId];
      else rules[ruleId] = value;
      return persist({ ...current, rules });
    },
    [day, date, persist],
  );

  return { day, loading: day === null, saving, error, addEntry, removeEntry, setWeight, setRuleValue };
}
