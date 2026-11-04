// @vitest-environment jsdom
//
// The Rules tab, driven the way a user drives it.
//
// Reads resolve on a later task rather than the next microtask, the same as
// WorkoutRunner.test.tsx. Instant fakes hide bugs where a render between two
// awaits cancels the rest of a load, which is a mistake this app has shipped
// once already.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthState } from '../context/auth-context';
import { ToastContext } from '../context/toast-context';
import { listRules } from '../data/rules';
import { getDay, saveDay } from '../data/days';
import { listDays } from '../data/days';
import { refreshSummaries } from '../data/summaries';
import { todayKey, weekdayIndex } from '../lib/dates';
import type { DayLog, Rule, UserProfile } from '../lib/types';
import { Rules } from './Rules';

vi.mock('../data/rules', () => ({
  listRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  reorderRules: vi.fn(),
  rulesCollection: vi.fn(),
}));

vi.mock('../data/days', () => ({
  getDay: vi.fn(),
  saveDay: vi.fn(),
  listDays: vi.fn(),
  emptyDay: (date: string) => ({ date, calories: 0, entries: [] }),
  dayRef: vi.fn(),
}));

vi.mock('../data/summaries', () => ({ refreshSummaries: vi.fn() }));

const profile: UserProfile = {
  units: 'metric',
  heightCm: 180,
  weightKg: 85,
  age: 35,
  sex: 'male',
  goal: 'lose',
  activity: 'light',
  targetRateKgPerWeek: 0.45,
  calorieTarget: 2000,
};

const today = todayKey();
/** Weekdays that are not today, so a rule can be made to not apply. */
const notToday = [0, 1, 2, 3, 4, 5, 6].filter((index) => index !== weekdayIndex(today));

const noDrinking: Rule = {
  id: 'r1',
  name: 'No weekday drinking',
  type: 'boolean',
  target: 0,
  daysOfWeek: [],
  active: true,
  startDate: today,
};

const steps: Rule = {
  id: 'r2',
  name: '10k steps',
  type: 'numeric',
  target: 10_000,
  unit: 'steps',
  daysOfWeek: [],
  active: true,
  startDate: today,
};

function slow<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

const notify = vi.fn();

function renderRules() {
  const auth: AuthState = {
    user: { uid: 'u1' } as AuthState['user'],
    profile,
    loading: false,
    setProfile: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={auth}>
      <ToastContext.Provider value={notify}>
        <MemoryRouter initialEntries={['/rules']}>
          <Routes>
            <Route path="/rules" element={<Rules />} />
          </Routes>
        </MemoryRouter>
      </ToastContext.Provider>
    </AuthContext.Provider>,
  );
}

/** The last day document written. */
const savedDay = (): DayLog => {
  const calls = vi.mocked(saveDay).mock.calls;
  return calls[calls.length - 1][1];
};

beforeEach(() => {
  vi.mocked(listRules).mockImplementation(() => slow([noDrinking, steps]));
  vi.mocked(getDay).mockImplementation(() => slow({ date: today, calories: 0, entries: [] }));
  vi.mocked(listDays).mockImplementation(() => slow([]));
  vi.mocked(saveDay).mockResolvedValue(undefined);
  vi.mocked(refreshSummaries).mockResolvedValue({} as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the checklist', () => {
  it('lists today’s rules once loaded', async () => {
    renderRules();
    expect(await screen.findByText('No weekday drinking')).toBeTruthy();
    expect(screen.getByText('10k steps')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('leaves out a rule that does not apply today', async () => {
    vi.mocked(listRules).mockImplementation(() =>
      slow([noDrinking, { ...steps, daysOfWeek: notToday }]),
    );
    renderRules();

    await screen.findByText('No weekday drinking');
    expect(screen.queryByText('10k steps')).toBeNull();
  });

  it('counts how much is done today', async () => {
    renderRules();
    expect(await screen.findByText('0 of 2 done today.')).toBeTruthy();
  });

  it('says so plainly when the rules will not load', async () => {
    vi.mocked(listRules).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 5)),
    );
    renderRules();

    expect(await screen.findByText(/would not load/)).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offers a way in when there are no rules at all', async () => {
    vi.mocked(listRules).mockImplementation(() => slow([]));
    renderRules();
    expect(await screen.findByText(/Create your first rule/)).toBeTruthy();
  });

  it('says nothing applies when today is a day off', async () => {
    vi.mocked(listRules).mockImplementation(() =>
      slow([{ ...noDrinking, daysOfWeek: notToday }]),
    );
    renderRules();
    expect(await screen.findByText(/No rules apply today/)).toBeTruthy();
  });
});

describe('checking rules off', () => {
  it('ticks a yes/no rule with one tap anywhere on the row', async () => {
    const user = userEvent.setup();
    renderRules();

    const row = await screen.findByRole('button', { name: /No weekday drinking/ });
    expect(row.getAttribute('aria-pressed')).toBe('false');

    await user.click(row);
    await waitFor(() => expect(saveDay).toHaveBeenCalled());
    expect(savedDay().rules).toEqual({ r1: true });
  });

  it('unticks it again', async () => {
    vi.mocked(getDay).mockImplementation(() =>
      slow({ date: today, calories: 0, entries: [], rules: { r1: true } }),
    );
    const user = userEvent.setup();
    renderRules();

    const row = await screen.findByRole('button', { name: /No weekday drinking/ });
    expect(row.getAttribute('aria-pressed')).toBe('true');

    await user.click(row);
    await waitFor(() => expect(saveDay).toHaveBeenCalled());
    expect(savedDay().rules).toEqual({});
  });

  it('records the goal when Done is tapped on a number rule', async () => {
    const user = userEvent.setup();
    renderRules();

    await screen.findByText('10k steps');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveDay).toHaveBeenCalled());
    expect(savedDay().rules).toEqual({ r2: 10_000 });
  });

  it('writes a typed number once, on blur', async () => {
    const user = userEvent.setup();
    renderRules();

    const input = await screen.findByLabelText('10k steps');
    await user.type(input, '7500');
    expect(saveDay).not.toHaveBeenCalled(); // not once per digit

    await user.tab();
    await waitFor(() => expect(saveDay).toHaveBeenCalledTimes(1));
    expect(savedDay().rules).toEqual({ r2: 7500 });
  });

  it('offers Clear once a number rule is met', async () => {
    vi.mocked(getDay).mockImplementation(() =>
      slow({ date: today, calories: 0, entries: [], rules: { r2: 12_000 } }),
    );
    const user = userEvent.setup();
    renderRules();

    const clear = await screen.findByRole('button', { name: 'Clear' });
    await user.click(clear);
    await waitFor(() => expect(saveDay).toHaveBeenCalled());
    expect(savedDay().rules).toEqual({});
  });

  it('congratulates a clean sweep', async () => {
    vi.mocked(getDay).mockImplementation(() =>
      slow({ date: today, calories: 0, entries: [], rules: { r1: true, r2: 10_000 } }),
    );
    renderRules();
    expect(await screen.findByText(/All 2 done today/)).toBeTruthy();
  });
});

describe('streaks', () => {
  it('shows a run of met days, small', async () => {
    const history: DayLog[] = [];
    // Yesterday and the day before, both met. Today is still open.
    for (let back = 1; back <= 2; back++) {
      const date = new Date(`${today}T00:00:00`);
      date.setDate(date.getDate() - back);
      history.push({
        date: date.toISOString().slice(0, 10),
        calories: 0,
        entries: [],
        rules: { r1: true },
      });
    }
    vi.mocked(listDays).mockImplementation(() => slow(history));
    vi.mocked(listRules).mockImplementation(() =>
      slow([{ ...noDrinking, startDate: history[1].date }]),
    );

    renderRules();
    expect(await screen.findByText('2 days in a row')).toBeTruthy();
  });

  it('shows nothing when there is no run yet', async () => {
    renderRules();
    await screen.findByText('No weekday drinking');
    expect(screen.queryByText(/in a row/)).toBeNull();
  });
});
