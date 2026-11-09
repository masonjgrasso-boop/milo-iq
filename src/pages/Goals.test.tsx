// @vitest-environment jsdom
//
// Changing a goal, driven the way a user drives it.
//
// The claims worth proving are the ones that are expensive to get wrong:
// that nothing is written until the confirmation is accepted, that the goal
// being left is written down so old logs keep their own yardstick, and that a
// measured maintenance figure is not quietly replaced by the formula.
//
// Reads resolve on a later task rather than the next microtask, the same as
// Rules.test.tsx, so a render between two awaits cannot hide a load bug.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthState } from '../context/auth-context';
import { listDays } from '../data/days';
import { saveProfile } from '../lib/profile';
import { todayKey } from '../lib/dates';
import { MIN_DAYS } from '../lib/maintenance';
import { goalOn } from '../lib/goals';
import { targetFromMaintenance } from '../lib/targets';
import { lbToKg } from '../lib/units';
import type { DayLog, UserProfile } from '../lib/types';
import { Goals } from './Goals';

vi.mock('../data/days', () => ({
  listDays: vi.fn(),
  emptyDay: (date: string) => ({ date, calories: 0, entries: [] }),
  getDay: vi.fn(),
  saveDay: vi.fn(),
  dayRef: vi.fn(),
}));

vi.mock('../lib/profile', async () => {
  const actual = await vi.importActual<typeof import('../lib/profile')>('../lib/profile');
  return { ...actual, saveProfile: vi.fn(), profileRef: vi.fn(), loadProfile: vi.fn() };
});

const today = todayKey();

/** A 176lb man on imperial units, losing 1lb a week on a 2,000 target. */
const profile: UserProfile = {
  units: 'imperial',
  heightCm: 178,
  weightKg: 80,
  age: 30,
  sex: 'male',
  goal: 'lose',
  activity: 'light',
  targetRateKgPerWeek: lbToKg(1),
  calorieTarget: 2000,
};

function slow<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

const setProfile = vi.fn();

function renderGoals(overrides: Partial<UserProfile> = {}) {
  const auth: AuthState = {
    user: { uid: 'u1' } as AuthState['user'],
    profile: { ...profile, ...overrides },
    loading: false,
    setProfile,
  };

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/goals']}>
        <Routes>
          <Route path="/goals" element={<Goals />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const inputValue = (label: RegExp | string): string =>
  (screen.getByLabelText(label) as HTMLInputElement).value;

const isDisabled = (name: string): boolean =>
  (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

/** The profile handed to the last save. */
const savedProfile = (): UserProfile => {
  const calls = vi.mocked(saveProfile).mock.calls;
  return calls[calls.length - 1][1] as UserProfile;
};

/**
 * Enough logged days, weigh-ins and span for the maintenance estimate to be
 * ready. Eating 2,400 while the trend holds steady measures maintenance at
 * 2,400, which is well above what the formula gives this body.
 */
function measurableDays(): DayLog[] {
  return Array.from({ length: MIN_DAYS + 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - (MIN_DAYS + 6 - index));
    return {
      date: date.toISOString().slice(0, 10),
      calories: 2400,
      entries: [],
      weightKg: 80,
    };
  });
}

type User = ReturnType<typeof userEvent.setup>;

/** Opens the form and switches to the gain goal at the given rate. */
async function switchToGain(user: User, rate = '0.5') {
  await user.click(screen.getByRole('button', { name: 'Change goal' }));
  await user.click(screen.getByRole('button', { name: 'Gain' }));
  const field = screen.getByLabelText(/^How much to gain/);
  await user.clear(field);
  await user.type(field, rate);
}

beforeEach(() => {
  vi.mocked(listDays).mockImplementation(() => slow([]));
  vi.mocked(saveProfile).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the current goal', () => {
  it('names the goal and its target without opening the form', () => {
    renderGoals();
    expect(screen.getByText('Losing weight')).toBeTruthy();
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.queryByLabelText(/^How much to/)).toBeNull();
  });

  it('prefills the form with what is already set', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));

    expect(inputValue('Age in years')).toBe('30');
    // 1 lb a week, round-tripped through kilograms and back.
    expect(inputValue(/^How much to lose/)).toBe('1');
  });

  it('hides the rate question when maintaining', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(screen.getByRole('button', { name: 'Maintain' }));

    expect(screen.queryByLabelText(/^How much to/)).toBeNull();
  });
});

describe('the new target', () => {
  it('shows the target before anything is saved', async () => {
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');

    expect(await screen.findByText('Your new daily target')).toBeTruthy();
    expect(vi.mocked(saveProfile)).not.toHaveBeenCalled();
  });

  it('waits for a rate before naming a goal target', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(screen.getByRole('button', { name: 'Gain' }));
    await user.clear(screen.getByLabelText(/^How much to gain/));

    expect(screen.queryByText('Your new daily target')).toBeNull();
    expect(isDisabled('Save goal')).toBe(true);
  });

  it('keeps a measured maintenance figure instead of re-running the formula', async () => {
    vi.mocked(listDays).mockImplementation(() => slow(measurableDays()));
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');

    // Eating 2,400 at a flat trend weight measures maintenance at 2,400, and
    // the new target has to be built on that rather than on Mifflin-St Jeor.
    const expected = targetFromMaintenance(2400, {
      goal: 'gain',
      sex: 'male',
      targetRateKgPerWeek: lbToKg(0.5),
    });
    expect(await screen.findByText(expected.calorieTarget.toLocaleString())).toBeTruthy();
    expect(screen.getByText(/measured from your own logs/)).toBeTruthy();
  });

  it('says it is an estimate while there are not enough logs', async () => {
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');

    expect(await screen.findByText(/A starting estimate/)).toBeTruthy();
  });

  it('warns gently when the rate would breach the safe floor', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    const field = screen.getByLabelText(/^How much to lose/);
    await user.clear(field);
    await user.type(field, '3');

    expect(await screen.findByText(/lower than we would suggest going/)).toBeTruthy();
  });

  it('warns when the rate is more than 1% of body weight a week', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    const field = screen.getByLabelText(/^How much to lose/);
    await user.clear(field);
    // 1.8 lb a week is over 1% of 80 kg while still leaving the target above
    // the floor, so it is the aggressive note rather than the floor one.
    await user.type(field, '1.8');

    expect(await screen.findByText(/more than 1% of your body weight/)).toBeTruthy();
  });

  it('converts the rate rather than leaving a pound reading as a kilo', async () => {
    const user = userEvent.setup();
    renderGoals();
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await user.click(screen.getByRole('button', { name: 'kg / cm' }));

    // 1 lb a week is 0.45 kg a week, not 1 kg a week.
    expect(inputValue(/^How much to lose/)).toBe('0.45');
  });
});

describe('the confirmation', () => {
  it('asks before saving, and saves nothing if cancelled', async () => {
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save goal' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Start your new goal from today?');
    expect(dialog.textContent).toContain('Your past logs, photos, and workouts stay.');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(vi.mocked(saveProfile)).not.toHaveBeenCalled();
  });

  it('saves on confirm and says so', async () => {
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save goal' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalledTimes(1));
    expect(savedProfile().goal).toBe('gain');
    expect(setProfile).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Your new goal starts today/)).toBeTruthy();
  });
});

describe('goal history', () => {
  it('writes down the goal being left, so old logs keep their yardstick', async () => {
    const user = userEvent.setup();
    renderGoals();
    await switchToGain(user, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save goal' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalled());
    const history = savedProfile().goalHistory ?? [];

    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ startDate: today, goal: 'gain' });
    // The whole point: a day logged before today is still judged on 2,000.
    expect(goalOn(history, '2026-01-02')).toMatchObject({
      goal: 'lose',
      calorieTarget: 2000,
    });
  });

  it('appends to history that already exists rather than reseeding it', async () => {
    const existing = [
      { startDate: '2026-01-01', goal: 'lose' as const, targetRateKgPerWeek: 0.45, calorieTarget: 1900 },
      { startDate: '2026-06-01', goal: 'lose' as const, targetRateKgPerWeek: lbToKg(1), calorieTarget: 2000 },
    ];
    const user = userEvent.setup();
    renderGoals({ goalHistory: existing });
    await switchToGain(user, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save goal' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalled());
    const history = savedProfile().goalHistory ?? [];

    expect(history).toHaveLength(3);
    expect(history[0].calorieTarget).toBe(1900);
    expect(goalOn(history, '2026-03-01')?.calorieTarget).toBe(1900);
  });

  it('lists past goals once there is more than one', () => {
    renderGoals({
      goalHistory: [
        { startDate: '2026-01-01', goal: 'lose', targetRateKgPerWeek: 0.45, calorieTarget: 1900 },
        { startDate: '2026-06-01', goal: 'gain', targetRateKgPerWeek: 0.2, calorieTarget: 2800 },
      ],
    });

    expect(screen.getByText('Goal history')).toBeTruthy();
    expect(screen.getByText('2,800 cal')).toBeTruthy();
    expect(screen.getByText('1,900 cal')).toBeTruthy();
  });

  it('shows no history for someone who has never changed goals', () => {
    renderGoals();
    expect(screen.queryByText('Goal history')).toBeNull();
  });

  it('adds no goal period when the target did not actually move', async () => {
    // Maintenance is measured here, so it does not depend on the age being
    // corrected, and the target comes out identical.
    vi.mocked(listDays).mockImplementation(() => slow(measurableDays()));
    const settled = targetFromMaintenance(2400, {
      goal: 'lose', sex: 'male', targetRateKgPerWeek: lbToKg(1),
    }).calorieTarget;

    const user = userEvent.setup();
    renderGoals({ calorieTarget: settled });
    await user.click(screen.getByRole('button', { name: 'Change goal' }));
    await waitFor(() => expect(screen.getByText(/measured from your own logs/)).toBeTruthy());

    await user.clear(screen.getByLabelText('Age in years'));
    await user.type(screen.getByLabelText('Age in years'), '31');
    await user.click(screen.getByRole('button', { name: 'Save goal' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalled());
    // The age is saved, but nothing about the aim moved, so no new period.
    expect(savedProfile().age).toBe(31);
    expect(savedProfile().goalHistory).toBeUndefined();
  });
});
