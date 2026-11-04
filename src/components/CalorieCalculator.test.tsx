// @vitest-environment jsdom
//
// The calculator a visitor uses before signing in.
//
// The claims worth proving are the ones a visitor is trusting: that the number
// shown is the same number the app would start them on, that the rate they
// typed is the rate that was used, and that none of it is stored.
//
// The fixture is a 190lb, 5'10", 30-year-old man on light activity, whose
// maintenance lands near 2,514. At that weight 1% of body weight is about
// 1.9lb a week, which is what puts 1lb below the caution line, 2lb over it,
// and 3lb far enough to be clamped at the 1,500 floor.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { calculateCalorieTarget } from '../lib/targets';
import { rateToKgPerWeek, type RatePeriod } from '../lib/rate';
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

type User = ReturnType<typeof userEvent.setup>;

/** Fill in the three fields that gate the maintenance figure. */
async function fillBody(user: User) {
  await user.clear(screen.getByLabelText('Feet'));
  await user.type(screen.getByLabelText('Feet'), '5');
  await user.clear(screen.getByLabelText('Inches'));
  await user.type(screen.getByLabelText('Inches'), '10');
  await user.type(screen.getByLabelText('Weight in lb'), '190');
  await user.type(screen.getByLabelText('Age in years'), '30');
}

/** Type a rate into whichever rate field is on screen. */
async function fillRate(user: User, amount: string) {
  await user.type(screen.getByLabelText(/^How much to/), amount);
}

/** What the app itself would work out for the same person and rate. */
function expected(
  goal: 'lose' | 'maintain' | 'gain',
  rate = 0,
  period: RatePeriod = 'week',
) {
  return calculateCalorieTarget({
    weightKg: lbToKg(190),
    heightCm: feetInchesToCm(5, 10),
    age: 30,
    sex: 'male',
    activity: 'light',
    goal,
    targetRateKgPerWeek: goal === 'maintain' ? 0 : rateToKgPerWeek(rate, period, 'imperial'),
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

describe('maintenance', () => {
  it('appears from the body alone, before any rate is given', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    const { tdee } = expected('lose');
    expect(screen.getAllByText(tdee.toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.getByText(/What your body burns on a normal day/)).toBeTruthy();
  });

  it('holds the daily goal back until a rate is entered', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);

    expect(screen.getByText(/Enter how much you want to lose/)).toBeTruthy();
    expect(screen.queryByText('Your daily goal')).toBeNull();
  });
});

describe('the rate question', () => {
  it('is asked when losing, which is the default', () => {
    open();
    expect(screen.getByLabelText(/^How much to lose/)).toBeTruthy();
  });

  it('is asked when gaining', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Gain' }));
    expect(screen.getByLabelText(/^How much to gain/)).toBeTruthy();
  });

  it('is not asked when maintaining', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Maintain' }));
    expect(screen.queryByLabelText(/^How much to/)).toBeNull();
  });

  it('is cleared when the units change, because the number would mean something else', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '1');
    expect(screen.getByText('Your daily goal')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'kg / cm' }));
    expect((screen.getByLabelText(/^How much to lose/) as HTMLInputElement).value).toBe('');
  });
});

describe('the daily goal', () => {
  it('comes from the rate that was typed', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '1');

    const { calorieTarget } = expected('lose', 1);
    expect(screen.getByText(calorieTarget.toLocaleString())).toBeTruthy();
    expect(screen.getByText(/At 1 lb a week/)).toBeTruthy();
  });

  it('reads a monthly rate as a smaller weekly one', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '4');
    await user.click(screen.getByRole('button', { name: 'per month' }));

    const monthly = expected('lose', 4, 'month');
    const weekly = expected('lose', 4, 'week');
    // Four pounds a month is a far gentler deficit than four a week.
    expect(monthly.calorieTarget).toBeGreaterThan(weekly.calorieTarget);
    expect(screen.getByText(monthly.calorieTarget.toLocaleString())).toBeTruthy();
    expect(screen.getByText(/At 4 lb a month/)).toBeTruthy();
  });

  it('sits at maintenance when maintaining, with no rate asked', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'Maintain' }));

    const { tdee, calorieTarget } = expected('maintain');
    expect(calorieTarget).toBe(tdee);
    expect(screen.getByText(/No deficit or surplus/)).toBeTruthy();
  });

  it('rises above maintenance when gaining', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'Gain' }));
    await fillRate(user, '1');

    const { tdee, calorieTarget } = expected('gain', 1);
    expect(calorieTarget).toBeGreaterThan(tdee);
    expect(screen.getByText(calorieTarget.toLocaleString())).toBeTruthy();
  });
});

describe('cautions', () => {
  it('says nothing about a sensible rate', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '1');

    expect(screen.queryByText(/more than 1% of your body weight/)).toBeNull();
    expect(screen.queryByText(/lower than we would suggest/)).toBeNull();
  });

  it('mentions 1% of body weight for a fast rate, and names a slower one', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '2');

    // 2lb a week is just over 1% for a 190lb person, but not low enough to clamp.
    expect(expected('lose', 2).clampedToFloor).toBe(false);
    expect(screen.getByText(/more than 1% of your body weight a week/)).toBeTruthy();
    expect(screen.getByText(/1\.9 lb a week tends to go better/)).toBeTruthy();
  });

  it('says so plainly when the rate would go under the safe floor', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await fillRate(user, '3');

    expect(expected('lose', 3).clampedToFloor).toBe(true);
    expect(screen.getByText(/under 1,500 calories a day/)).toBeTruthy();
    expect(screen.getByText(/being held at 1,500 instead/)).toBeTruthy();
  });

  it('quotes the right floor for a woman', async () => {
    const user = userEvent.setup();
    open();
    await fillBody(user);
    await user.click(screen.getByRole('button', { name: 'Female' }));
    await fillRate(user, '3');

    expect(screen.getByText(/under 1,200 calories a day/)).toBeTruthy();
  });
});

describe('the way through to the app', () => {
  it('is always offered alongside the estimate', async () => {
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
    await fillRate(user, '1');

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
