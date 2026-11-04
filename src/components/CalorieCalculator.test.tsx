// @vitest-environment jsdom
//
// The calculator a visitor uses before signing in.
//
// The two claims worth proving are the ones a visitor is trusting: that the
// number shown is the same number the app would start them on, and that
// using it stores nothing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { calculateCalorieTarget } from '../lib/targets';
import { feetInchesToCm, lbToKg } from '../lib/units';
import { CalorieCalculator } from './CalorieCalculator';

const onClose = vi.fn();

function open() {
  return render(
    <MemoryRouter>
      <CalorieCalculator onClose={onClose} />
    </MemoryRouter>,
  );
}

/** Fill in the three fields that gate the result. */
async function fillBody(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText('Feet'));
  await user.type(screen.getByLabelText('Feet'), '5');
  await user.clear(screen.getByLabelText('Inches'));
  await user.type(screen.getByLabelText('Inches'), '10');
  await user.type(screen.getByLabelText('Weight in lb'), '190');
  await user.type(screen.getByLabelText('Age in years'), '30');
}

/** What the app itself would work out for the same person. */
function expected(goal: 'lose' | 'maintain' | 'gain') {
  return calculateCalorieTarget({
    weightKg: lbToKg(190),
    heightCm: feetInchesToCm(5, 10),
    age: 30,
    sex: 'male',
    activity: 'light',
    goal,
    targetRateKgPerWeek: goal === 'maintain' ? 0 : 0.5,
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('before there is enough to go on', () => {
  it('asks for the three fields it needs', () => {
    open();
    expect(screen.getByText(/Fill in your height, weight and age/)).toBeTruthy();
  });

  it('shows no calorie figure yet', () => {
    open();
    expect(screen.queryByText(/Maintenance calories/)).toBeNull();
  });
});

describe('with a body filled in', () => {
  it('shows the same maintenance figure the app would', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    const { tdee } = expected('lose');
    expect(tdee).toBeGreaterThan(1000);
    // The figure appears twice: the hero, and the stat tile beside the goal.
    expect(screen.getAllByText(tdee.toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.getByText(/What your body burns on a normal day/)).toBeTruthy();
  });

  it('shows the goal the app would set for losing', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    const { calorieTarget } = expected('lose');
    expect(screen.getByText(calorieTarget.toLocaleString())).toBeTruthy();
  });

  it('puts the goal at maintenance when maintaining', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'Maintain' }));

    const { tdee, calorieTarget } = expected('maintain');
    expect(calorieTarget).toBe(tdee);
    expect(screen.getByText(/No deficit or surplus/)).toBeTruthy();
  });

  it('raises the goal above maintenance when gaining', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'Gain' }));

    const { tdee, calorieTarget } = expected('gain');
    expect(calorieTarget).toBeGreaterThan(tdee);
    expect(screen.getByText(calorieTarget.toLocaleString())).toBeTruthy();
  });

  it('says what rate it assumed, since it never asked', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    expect(screen.getByText(/Assumes 1 lb a week/)).toBeTruthy();
  });

  it('switches the assumed rate to kg with the units', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'kg / cm' }));
    // Clearing the weight is deliberate, so the result goes until it is retyped.
    await user.type(screen.getByLabelText('Weight in kg'), '86');
    expect(screen.getByText(/Assumes 0.5 kg a week/)).toBeTruthy();
  });

  it('always offers the way in to the real thing', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    expect(screen.getByText(/This is an estimate/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Get started free' });
    expect(link.getAttribute('href')).toBe('/signin');
  });
});

describe('closing it', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the X', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Close the calculator' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('is a modal dialog with a name', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('Your calories')).toBeTruthy();
  });
});

describe('it saves nothing', () => {
  it('leaves no trace in browser storage', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
