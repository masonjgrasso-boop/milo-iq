// @vitest-environment jsdom
//
// The landing page, which is the only screen a visitor sees before deciding
// whether to sign in at all.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing';

// ProviderButtons reaches for Firebase auth, which has no place in a render test.
vi.mock('../lib/auth', () => ({
  enabledProviders: ['google'],
  providerLabels: { google: 'Google', apple: 'Apple', microsoft: 'Microsoft' },
  signInWith: vi.fn(),
}));

function open() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the landing page', () => {
  it('leads with what the app is for', () => {
    open();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByText(/Missing a weekend/)).toBeTruthy();
  });

  it('offers both of the two ways in', () => {
    open();
    expect(screen.getAllByRole('link', { name: 'Get started free' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Calculate your calories' })).toBeTruthy();
  });

  it('sends Get started free to sign-in', () => {
    open();
    const [link] = screen.getAllByRole('link', { name: 'Get started free' });
    expect(link.getAttribute('href')).toBe('/signin');
  });

  it('explains itself in three steps', () => {
    open();
    expect(screen.getByText('Log food and weight')).toBeTruthy();
    expect(screen.getByText('See your real maintenance')).toBeTruthy();
    expect(screen.getByText('Stay on track after a bad weekend')).toBeTruthy();
  });

  it('closes with sign-in and the three footer links', () => {
    open();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeTruthy();
  });

  it('shows no calculator until it is asked for', () => {
    open();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the calculator, and closes it again', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Calculate your calories' }));
    // The calculator is a lazy chunk, so it arrives a tick after the click.
    expect(await screen.findByRole('dialog')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Close the calculator' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
