import { describe, it, expect } from 'vitest';
import { displayNameFor } from './display';

describe('displayNameFor', () => {
  it('prefers the account display name', () => {
    expect(displayNameFor({ displayName: 'Sam Patel', email: 'sam@example.test' }))
      .toBe('Sam Patel');
  });

  it('falls back to the local part of the email', () => {
    expect(displayNameFor({ displayName: null, email: 'sam.patel@example.test' }))
      .toBe('sam.patel');
  });

  it('never exposes the full email address', () => {
    expect(displayNameFor({ displayName: null, email: 'sam@example.test' }))
      .not.toContain('@');
  });

  it('handles a blank display name', () => {
    expect(displayNameFor({ displayName: '   ', email: 'sam@example.test' })).toBe('sam');
  });

  it('falls back to a generic name when there is nothing to use', () => {
    expect(displayNameFor({ displayName: null, email: null })).toBe('Member');
  });
});
