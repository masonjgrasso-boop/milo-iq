// How a user is shown to other people.

import type { User } from 'firebase/auth';

/**
 * A name to show group members. Falls back to the part of the email before
 * the @, so nobody is ever listed as "undefined" — and never shows the full
 * email address, which is not the user's to leak to a group.
 */
export function displayNameFor(user: Pick<User, 'displayName' | 'email'>): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  const local = user.email?.split('@')[0];
  return local && local.length > 0 ? local : 'Member';
}
