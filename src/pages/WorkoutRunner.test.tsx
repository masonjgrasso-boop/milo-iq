// @vitest-environment jsdom
//
// The workout flow, driven the way a user drives it.
//
// This screen has had two bugs that no pure-function test could have caught:
// an effect that cancelled its own continuation and left the spinner running
// forever, and a reload that wiped sets in progress. Both were about the
// component, not the arithmetic, so they are tested here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthState } from '../context/auth-context';
import { ToastContext } from '../context/toast-context';
import { getRoutine, markRoutineDone } from '../data/routines';
import { createExercise, getSession, listExercises, saveSession } from '../data/workouts';
import type { Exercise, Routine, UserProfile } from '../lib/types';
import { WorkoutRunner } from './WorkoutRunner';

vi.mock('../data/routines', () => ({
  getRoutine: vi.fn(),
  markRoutineDone: vi.fn(),
  saveRoutine: vi.fn(),
}));

vi.mock('../data/workouts', () => ({
  getSession: vi.fn(),
  saveSession: vi.fn(),
  listExercises: vi.fn(),
  seedStarterExercises: vi.fn(),
  createExercise: vi.fn(),
}));

const profile: UserProfile = {
  units: 'metric', // so kilograms in is kilograms out
  heightCm: 180,
  weightKg: 85,
  age: 35,
  sex: 'male',
  goal: 'lose',
  activity: 'light',
  targetRateKgPerWeek: 0.45,
  calorieTarget: 2000,
};

const squat: Exercise = {
  id: 'sq',
  name: 'Squat',
  isCustom: false,
  lastDate: '2026-10-25',
  lastSets: [{ weightKg: 100, reps: 8 }],
  bestE1rmKg: 126.7,
};

const legs: Routine = {
  id: 'day1',
  name: 'Legs',
  order: 0,
  exercises: [{ exerciseId: 'sq', name: 'Squat', sets: 2 }],
};

const notify = vi.fn();

function renderRunner() {
  const auth: AuthState = {
    user: { uid: 'u1' } as AuthState['user'],
    profile,
    loading: false,
    setProfile: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={auth}>
      <ToastContext.Provider value={notify}>
        <MemoryRouter initialEntries={['/lift/do/day1']}>
          <Routes>
            <Route path="/lift/do/:routineId" element={<WorkoutRunner />} />
          </Routes>
        </MemoryRouter>
      </ToastContext.Provider>
    </AuthContext.Provider>,
  );
}

/** The exercise cards are rendered once the spinner clears. */
const laidOut = () => screen.findByLabelText('Squat set 1 weight');

/**
 * Resolves on a later task, not the next microtask.
 *
 * This matters more than it looks. A read that resolves instantly hides any
 * bug where a render between two awaits cancels the rest of the load — and
 * that is exactly the bug this screen shipped with. Real Firestore reads take
 * real time, so the fakes have to as well.
 */
function slow<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

beforeEach(() => {
  vi.mocked(listExercises).mockImplementation(() => slow([squat]));
  vi.mocked(getRoutine).mockImplementation(() => slow(legs));
  vi.mocked(getSession).mockImplementation(() => slow(null));
  vi.mocked(saveSession).mockResolvedValue({ date: '2026-11-02', sets: [], bestE1rmKg: 0 });
  vi.mocked(markRoutineDone).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('laying the workout out', () => {
  it('stops loading and shows every planned set', async () => {
    renderRunner();

    // The regression that mattered: this used to spin forever.
    await laidOut();
    expect(screen.queryByText(/Setting up your workout/)).toBeNull();
    expect(screen.getByLabelText('Squat set 2 weight')).toBeTruthy();
    expect(screen.queryByLabelText('Squat set 3 weight')).toBeNull();
  });

  it('shows last session as a reference line', async () => {
    renderRunner();
    await laidOut();
    expect(screen.getByText(/Last time: 100 x 8/)).toBeTruthy();
  });

  it('leaves both boxes empty, with no placeholder reps', async () => {
    renderRunner();
    const weight = (await laidOut()) as HTMLInputElement;
    const reps = screen.getByLabelText('Squat set 1 reps') as HTMLInputElement;

    expect(weight.value).toBe('');
    expect(reps.value).toBe('');
    expect(weight.getAttribute('placeholder')).toBeNull();
    expect(reps.getAttribute('placeholder')).toBeNull();
  });

  it('says so plainly when the load fails', async () => {
    vi.mocked(getRoutine).mockImplementation(() =>
      new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 5)),
    );
    renderRunner();

    expect(await screen.findByText(/would not load/)).toBeTruthy();
    expect(screen.queryByText(/Setting up your workout/)).toBeNull();
  });

  it('restores sets already logged today', async () => {
    vi.mocked(getSession).mockImplementation(() =>
      slow({
        date: '2026-11-02',
        sets: [{ weightKg: 102.5, reps: 6 }],
        bestE1rmKg: 123,
      }),
    );
    renderRunner();

    const weight = (await laidOut()) as HTMLInputElement;
    expect(weight.value).toBe('102.5');
    expect(screen.getByLabelText('Undo Squat set 1')).toBeTruthy();
  });
});

describe('logging a set', () => {
  it('will not log without a weight', async () => {
    const user = userEvent.setup();
    renderRunner();
    await laidOut();

    await user.type(screen.getByLabelText('Squat set 1 reps'), '8');
    expect((screen.getByLabelText('Log Squat set 1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('will not log without reps', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '100');
    expect((screen.getByLabelText('Log Squat set 1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes the set the user typed, and nothing else', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '105');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '5');
    await user.click(screen.getByLabelText('Log Squat set 1'));

    await waitFor(() => expect(saveSession).toHaveBeenCalled());
    const [, exercise, , sets] = vi.mocked(saveSession).mock.calls[0];
    expect(exercise.id).toBe('sq');
    expect(sets).toEqual([{ weightKg: 105, reps: 5 }]);
  });

  it('badges a set that beats the previous best', async () => {
    vi.mocked(listExercises).mockImplementation(() => slow([{ ...squat, bestE1rmKg: 50 }]));
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '105');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '5');
    await user.click(screen.getByLabelText('Log Squat set 1'));

    expect(await screen.findByText(/New best/)).toBeTruthy();
  });

  it('does not badge a set that falls short of the previous best', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '60');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '5');
    await user.click(screen.getByLabelText('Log Squat set 1'));

    await waitFor(() => expect(saveSession).toHaveBeenCalled());
    expect(screen.queryByText(/New best/)).toBeNull();
  });

  it('can be undone', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '100');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '8');
    await user.click(screen.getByLabelText('Log Squat set 1'));

    const undo = await screen.findByLabelText('Undo Squat set 1');
    await user.click(undo);
    expect(await screen.findByLabelText('Log Squat set 1')).toBeTruthy();
  });
});

describe('changing the line-up mid workout', () => {
  it('keeps logged sets when a new exercise is added', async () => {
    vi.mocked(createExercise).mockImplementation(() =>
      slow({ id: 'rdl', name: 'RDL', isCustom: true }),
    );
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '100');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '8');
    await user.click(screen.getByLabelText('Log Squat set 1'));
    await screen.findByLabelText('Undo Squat set 1');

    // Adding an exercise changes the library's identity, which once rebuilt
    // every slot and threw away the set just logged.
    await user.click(screen.getByRole('button', { name: /Add an exercise for today/ }));
    await user.type(screen.getByLabelText('Search exercises'), 'RDL');
    await user.click(screen.getByRole('button', { name: /Add .*RDL.* as a new exercise/ }));

    expect(await screen.findByLabelText('RDL set 1 weight')).toBeTruthy();
    expect(screen.getByLabelText('Undo Squat set 1')).toBeTruthy();
    expect((screen.getByLabelText('Squat set 1 weight') as HTMLInputElement).value).toBe('100');
  });
});

describe('finishing', () => {
  it('summarises the work and marks the day done', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(await laidOut(), '100');
    await user.type(screen.getByLabelText('Squat set 1 reps'), '8');
    await user.click(screen.getByLabelText('Log Squat set 1'));
    await waitFor(() => expect(saveSession).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /Finish workout/ }));

    expect(await screen.findByText(/1 set across 1 exercise/)).toBeTruthy();
    expect(markRoutineDone).toHaveBeenCalledWith('u1', 'day1', expect.any(String));
  });

  it('is kind about a workout with nothing logged', async () => {
    const user = userEvent.setup();
    renderRunner();
    await laidOut();

    await user.click(screen.getByRole('button', { name: /Finish workout/ }));
    expect(await screen.findByText(/Nothing logged this time/)).toBeTruthy();
  });
});
