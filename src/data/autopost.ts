// Posting on the member's behalf.
//
// The app notices things worth saying and writes them into each group the
// member shares that category with. Nothing goes to a group whose flag is
// off, and the flag is read from the copy on the member's own pointer, so
// deciding where to post costs no reads at all.
//
// Everything lands on one card per member per day. The id is derived from
// the member and the day and each line is a keyed entry on it, so running the
// same check twice is a no-op and four things happening on one Tuesday are
// one card with four lines rather than four cards.

import { digestId, ITEM_FLAG, type PostItem } from '../lib/feed';
import type { DayKey } from '../lib/dates';
import { touchGroupActivity, type Membership } from './groups';
import { writeDigestItem } from './posts';

export interface Author {
  uid: string;
  name: string;
  photo?: string;
}

/** The groups this member has turned the matching category on for. */
export function groupsFor(memberships: Membership[], item: PostItem['kind']): Membership[] {
  const flag = ITEM_FLAG[item];
  return memberships.filter((membership) => membership.shareFlags?.[flag] === true);
}

/**
 * Adds one line to the member's digest in every group that should hear it.
 *
 * Failures are swallowed per group on purpose. A post is a nicety; somebody
 * who has just finished a workout should not see an error because one group
 * they are in was deleted underneath them.
 */
export async function postToGroups(
  memberships: Membership[],
  author: Author,
  day: DayKey,
  item: PostItem,
): Promise<void> {
  const targets = groupsFor(memberships, item.kind);
  if (targets.length === 0) return;

  const base = {
    authorUid: author.uid,
    authorName: author.name,
    ...(author.photo ? { authorPhoto: author.photo } : {}),
  };

  await Promise.all(
    targets.map(async (membership) => {
      try {
        await writeDigestItem(
          membership.groupId,
          digestId(author.uid, day),
          base,
          item,
        );
        await touchGroupActivity(membership.groupId);
      } catch {
        // Next time, then.
      }
    }),
  );
}
