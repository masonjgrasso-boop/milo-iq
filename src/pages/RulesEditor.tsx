import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useDayRange } from '../hooks/useDayRange';
import { createRule, deleteRule, listRules, reorderRules, updateRule } from '../data/rules';
import { addDays, startOfWeek, todayKey, WEEKDAY_LABELS } from '../lib/dates';
import {
  currentStreak, weekSummary, weeklyLimitStatus, weeklyLimitStreak, RULE_TYPE_LABELS,
  sortRules,
} from '../lib/rules';
import { moveItem } from '../lib/order';
import type { Rule, RuleType } from '../lib/types';
import { Button, Card, Choice, Field, NumberInput } from '../components/ui';
import { DragHandle, SortableList } from '../components/SortableList';
import { Page } from '../components/Layout';

export function RulesEditor() {
  const { user } = useAuth();
  const notify = useToast();
  const today = todayKey();
  const [rules, setRules] = useState<Rule[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Eight weeks of history is enough for streaks without reading a year of logs.
  const window = useMemo(
    () => ({ from: addDays(startOfWeek(today), -7 * 8), to: today }),
    [today],
  );
  const { days } = useDayRange(window.from, window.to);
  const weekDays = (days ?? []).filter((day) => day.date >= startOfWeek(today));

  useEffect(() => {
    if (user) listRules(user.uid).then((found) => setRules(sortRules(found)));
  }, [user]);

  async function handleCreate(rule: Omit<Rule, 'id'>) {
    if (!user) return;
    try {
      const created = await createRule(user.uid, rule);
      setRules((current) => [...current, created]);
      setAdding(false);
      notify('Rule created');
    } catch {
      notify('Could not create that rule. Check your connection.', 'error');
    }
  }

  // Each of these shows the change immediately, then puts it back if the
  // write fails — a rule that looks paused but is not would be worse than a
  // slow tap.
  async function handleToggleActive(rule: Rule) {
    if (!user) return;
    const paused = rule.active;
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, active: !item.active } : item)),
    );
    try {
      await updateRule(user.uid, rule.id, { active: !rule.active });
      notify(paused ? 'Rule paused' : 'Rule resumed');
    } catch {
      setRules((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, active: rule.active } : item)),
      );
      notify('Could not save that. Check your connection.', 'error');
    }
  }

  async function handleEdit(rule: Rule, changes: Partial<Omit<Rule, 'id'>>) {
    if (!user) return;
    const previous = rules;
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, ...changes } : item)),
    );
    setEditing(null);
    try {
      await updateRule(user.uid, rule.id, changes);
      notify('Rule updated');
    } catch {
      setRules(previous);
      notify('Could not save that change. Check your connection.', 'error');
    }
  }

  async function handleDelete(rule: Rule) {
    if (!user) return;
    const previous = rules;
    setRules((current) => current.filter((item) => item.id !== rule.id));
    setConfirming(null);
    try {
      await deleteRule(user.uid, rule.id);
      // The day documents keep every value they already hold, so the history
      // survives; it simply stops being shown.
      notify('Rule deleted — your past check-offs are kept');
    } catch {
      setRules(previous);
      notify('Could not delete that rule. Check your connection.', 'error');
    }
  }

  async function handleReorder(from: number, to: number) {
    if (!user) return;
    const previous = rules;
    const ordered = moveItem(rules, from, to);
    setRules(ordered.map((rule, index) => ({ ...rule, order: index })));
    try {
      await reorderRules(user.uid, ordered);
    } catch {
      setRules(previous);
      notify('Could not save that order. Check your connection.', 'error');
    }
  }

  return (
    <Page title="Edit rules" subtitle="Add, change, reorder or retire a habit.">
      <Link
        to="/rules"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; Today&rsquo;s rules
      </Link>

      <SortableList
        items={rules}
        keyOf={(rule) => rule.id}
        onReorder={handleReorder}
        gap={12}
        renderItem={(rule, handle, dragging) => {
          const streak =
            rule.type === 'weeklyLimit'
              ? weeklyLimitStreak(rule, days ?? [], today)
              : currentStreak(rule, days ?? [], today);
          const summary = weekSummary(rule, weekDays, today);
          const weekly =
            rule.type === 'weeklyLimit' ? weeklyLimitStatus(rule, weekDays, today) : null;

          return (
            <Card
              className={`${rule.active ? '' : 'opacity-60'} ${
                dragging ? 'border-brand-400 shadow-md' : ''
              }`}
            >
              <div className="flex items-start gap-1">
                <DragHandle handle={handle} label={rule.name} />
                <div className="min-w-0 flex-1">
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
                    ? 'Nothing counted yet this week'
                    : `${summary.met} of ${summary.applicable} ${
                        summary.applicable === 1 ? 'day' : 'days'
                      } so far this week (${summary.percent}%)`}
              </div>

              {editing === rule.id ? (
                <EditRuleForm
                  rule={rule}
                  onSave={(changes) => handleEdit(rule, changes)}
                  onCancel={() => setEditing(null)}
                />
              ) : confirming === rule.id ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">
                    Delete <strong>{rule.name}</strong>? Every day you already ticked stays
                    recorded — only the rule itself goes.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <Button variant="secondary" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                    <Button
                      onClick={() => handleDelete(rule)}
                      className="bg-red-600 hover:bg-red-700 active:bg-red-700"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setEditing(rule.id)}
                    className="font-medium text-brand-700 hover:text-brand-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(rule)}
                    className="font-medium text-slate-500 hover:text-slate-700"
                  >
                    {rule.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(rule.id)}
                    className="font-medium text-slate-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </Card>
          );
        }}
      />

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

/**
 * Editing an existing rule.
 *
 * The type is fixed. Switching a rule from "hit 10,000 steps" to "at most N
 * days a week" would reinterpret every value already recorded against it
 * under a different meaning, which is a quiet way to corrupt a year of
 * history. Making a new rule is the honest alternative.
 */
function EditRuleForm({ rule, onSave, onCancel }: {
  rule: Rule;
  onSave: (changes: Partial<Omit<Rule, 'id'>>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule.name);
  const [target, setTarget] = useState(String(rule.target));
  const [unit, setUnit] = useState(rule.unit ?? '');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(rule.daysOfWeek);

  const needsTarget = rule.type !== 'boolean';
  const targetValue = Number(target);
  const valid =
    name.trim().length > 0 && (!needsTarget || (Number.isFinite(targetValue) && targetValue > 0));

  function toggleDay(index: number) {
    setDaysOfWeek((current) =>
      current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort(),
    );
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-3">
      <Field label="What is the rule?">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
            outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </Field>

      {needsTarget && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={rule.type === 'numeric' ? 'Daily goal' : 'Max days per week'}>
            <NumberInput value={target} onChange={(event) => setTarget(event.target.value)} />
          </Field>
          {rule.type === 'numeric' && (
            <Field label="Unit">
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
                  outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </Field>
          )}
        </div>
      )}

      {rule.type !== 'weeklyLimit' && (
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

      <p className="text-xs text-slate-500">
        The kind of rule this is cannot change — past check-offs were recorded against it.
      </p>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!valid}
          onClick={() =>
            onSave({
              name: name.trim(),
              daysOfWeek,
              ...(needsTarget ? { target: targetValue } : {}),
              ...(rule.type === 'numeric' ? { unit: unit.trim() } : {}),
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
