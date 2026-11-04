// The Rules tab: today's checklist and nothing else.
//
// Opening this should answer one question — what have I still got to do today
// — so the list is today's rules only, big enough to tap without aiming, and
// blank again tomorrow because check-offs live on each day's own document.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useDay } from '../hooks/useDay';
import { useDayRange } from '../hooks/useDayRange';
import { listRules } from '../data/rules';
import { addDays, friendlyDayLabel, startOfWeek, todayKey } from '../lib/dates';
import { appliesOn, isMet, sortRules } from '../lib/rules';
import type { Rule } from '../lib/types';
import { Card } from '../components/ui';
import { RuleChecklist } from '../components/RuleChecklist';
import { Page } from '../components/Layout';

export function Rules() {
  const { user } = useAuth();
  const today = todayKey();

  const [rules, setRules] = useState<Rule[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Eight weeks is enough for the streak numbers without reading a year.
  const window = useMemo(
    () => ({ from: addDays(startOfWeek(today), -7 * 8), to: today }),
    [today],
  );
  const { days } = useDayRange(window.from, window.to);
  const { day, setRuleValue } = useDay(today);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listRules(user.uid)
      .then((found) => {
        if (!cancelled) setRules(sortRules(found));
      })
      // Better a message than a spinner that never stops.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const history = days ?? [];
  const weekDays = history.filter((entry) => entry.date >= startOfWeek(today));

  // The headline counts only rules you have to do. A weekly limit left
  // untouched is a good day, not an outstanding task.
  const todo = (rules ?? []).filter(
    (rule) => rule.type !== 'weeklyLimit' && appliesOn(rule, today),
  );
  const done = todo.filter((rule) => isMet(rule, day?.rules?.[rule.id])).length;

  return (
    <Page eyebrow={friendlyDayLabel(today)} title="Rules">
      {failed ? (
        <Card tone="cream">
          <p className="text-sm text-danger">
            Your rules would not load — that is usually the connection. Nothing has been
            lost; reload to try again.
          </p>
        </Card>
      ) : rules === null ? (
        <p className="mt-6 text-center text-sm text-ink-ghost">Loading…</p>
      ) : (
        <>
          {todo.length > 0 && (
            <p className="text-[15px] font-semibold text-ink-soft">
              {done === todo.length
                ? `All ${todo.length} done today. ${encouragement(todo.length)}`
                : `${done} of ${todo.length} done today.`}
            </p>
          )}

          <RuleChecklist
            rules={rules}
            date={today}
            day={day}
            weekDays={weekDays}
            historyDays={history}
            onChange={setRuleValue}
          />
        </>
      )}

      <Link
        to="/rules/edit"
        className="mt-2 flex h-[52px] items-center justify-center rounded-btn border
          border-line-in bg-surface text-base font-bold text-ink transition hover:bg-muted"
      >
        Edit rules
      </Link>
    </Page>
  );
}

/** A word, not a fanfare. */
function encouragement(count: number): string {
  return count === 1 ? 'That is the day.' : 'Clean sweep.';
}
