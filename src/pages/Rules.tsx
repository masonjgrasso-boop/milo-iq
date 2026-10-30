import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import { createRule, deleteRule, listRules, updateRule } from '../data/rules';
import { addDays, startOfWeek, todayKey, WEEKDAY_LABELS } from '../lib/dates';
import {
  currentStreak, weekSummary, weeklyLimitStatus, weeklyLimitStreak, RULE_TYPE_LABELS,
} from '../lib/rules';
import type { Rule, RuleType } from '../lib/types';
import { Button, Card, Choice, Field, NumberInput } from '../components/ui';
import { Page } from '../components/Layout';

export function Rules() {
  const { user } = useAuth();
  const today = todayKey();
  const [rules, setRules] = useState<Rule[]>([]);
  const [adding, setAdding] = useState(false);

  // Eight weeks of history is enough for streaks without reading a year of logs.
  const window = useMemo(
    () => ({ from: addDays(startOfWeek(today), -7 * 8), to: today }),
    [today],
  );
  const { days } = useDayRange(window.from, window.to);
  const weekDays = (days ?? []).filter((day) => day.date >= startOfWeek(today));

  useEffect(() => {
    if (user) listRules(user.uid).then(setRules);
  }, [user]);

  async function handleCreate(rule: Omit<Rule, 'id'>) {
    if (!user) return;
    const created = await createRule(user.uid, rule);
    setRules((current) => [...current, created]);
    setAdding(false);
  }

  async function handleToggleActive(rule: Rule) {
    if (!user) return;
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, active: !item.active } : item)),
    );
    await updateRule(user.uid, rule.id, { active: !rule.active });
  }

  async function handleDelete(rule: Rule) {
    if (!user) return;
    setRules((current) => current.filter((item) => item.id !== rule.id));
    await deleteRule(user.uid, rule.id);
  }

  return (
    <Page title="Rules" subtitle="The habits you hold yourself to.">
      <Link
        to="/more"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; Back
      </Link>

      <div className="space-y-3">
        {rules.map((rule) => {
          const streak =
            rule.type === 'weeklyLimit'
              ? weeklyLimitStreak(rule, days ?? [], today)
              : currentStreak(rule, days ?? [], today);
          const summary = weekSummary(rule, weekDays, today);
          const weekly =
            rule.type === 'weeklyLimit' ? weeklyLimitStatus(rule, weekDays, today) : null;

          return (
            <Card key={rule.id} className={rule.active ? '' : 'opacity-60'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{rule.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {RULE_TYPE_LABELS[rule.type]}
                    {rule.type === 'numeric' && ` · ${rule.target.toLocaleString()} ${rule.unit ?? ''}`}
                    {rule.type === 'weeklyLimit' && ` · max ${rule.target}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {rule.daysOfWeek.length === 0
                      ? 'Every day'
                      : rule.daysOfWeek.map((index) => WEEKDAY_LABELS[index]).join(', ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold text-brand-600">{streak}</p>
                  <p className="text-xs text-slate-500">
                    {rule.type === 'weeklyLimit' ? 'week streak' : 'day streak'}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {weekly
                  ? `${weekly.used} of ${weekly.limit} used this week`
                  : summary.applicable === 0
                    ? 'Nothing to judge yet this week'
                    : `${summary.met} of ${summary.applicable} days this week (${summary.percent}%)`}
              </div>

              <div className="mt-3 flex gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => handleToggleActive(rule)}
                  className="font-medium text-slate-500 hover:text-slate-700"
                >
                  {rule.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rule)}
                  className="font-medium text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4">
        {adding ? (
          <RuleForm onCreate={handleCreate} onCancel={() => setAdding(false)} />
        ) : (
          <Button onClick={() => setAdding(true)}>Add a rule</Button>
        )}
      </div>

      {rules.length === 0 && !adding && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Start with one. A rule you keep beats three you abandon.
        </p>
      )}
    </Page>
  );
}

function RuleForm({ onCreate, onCancel }: {
  onCreate: (rule: Omit<Rule, 'id'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<RuleType>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);

  const needsTarget = type !== 'boolean';
  const targetValue = Number(target);
  const valid =
    name.trim().length > 0 && (!needsTarget || (Number.isFinite(targetValue) && targetValue > 0));

  function toggleDay(index: number) {
    setDaysOfWeek((current) =>
      current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort(),
    );
  }

  return (
    <Card className="space-y-4">
      <Field label="What is the rule?">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="No weekday drinking"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
            outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </Field>

      <Field label="Type">
        <Choice
          value={type}
          onChange={setType}
          columns={1}
          options={[
            { value: 'boolean', label: 'Yes or no, each day' },
            { value: 'numeric', label: 'Hit a daily number' },
            { value: 'weeklyLimit', label: 'At most N days a week' },
          ]}
        />
      </Field>

      {needsTarget && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={type === 'numeric' ? 'Daily goal' : 'Max days per week'}>
            <NumberInput
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={type === 'numeric' ? '10000' : '1'}
            />
          </Field>
          {type === 'numeric' && (
            <Field label="Unit">
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="steps"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
                  outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
          )}
        </div>
      )}

      {type !== 'weeklyLimit' && (
        <Field label="Which days?" hint="Leave all unselected for every day.">
          <div className="flex gap-1.5">
            {WEEKDAY_LABELS.map((label, index) => {
              const selected = daysOfWeek.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
                    selected
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-300 bg-white text-slate-500'
                  }`}
                >
                  {label[0]}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!valid}
          onClick={() =>
            onCreate({
              name: name.trim(),
              type,
              target: needsTarget ? targetValue : 0,
              ...(type === 'numeric' && unit.trim() ? { unit: unit.trim() } : {}),
              daysOfWeek: type === 'weeklyLimit' ? [] : daysOfWeek,
              active: true,
            })
          }
        >
          Create
        </Button>
      </div>
    </Card>
  );
}
