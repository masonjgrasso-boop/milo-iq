// Writing the app's own lines into group feeds.
//
// Nothing goes to a group whose matching flag is off, and the flag is read
// from the copy on the member's own pointer, so deciding where to post costs
// no reads at all.
//
// Everything lands on one card per member per day. The id is derived from the
// member and the day and each line is a keyed entry on it, so running the
// same check twice is a no-op and four things happening on one Tuesday are
// one card with four lines rather than four cards.
//
// Failures are collected and handed back rather than swallowed. A post is a
// nicety, so it must not break the screen that triggered it — but a feed that
// quietly stops working is worse than one that says so, which is why the
// caller gets the list of groups that refused and shows it.

import { digestId, ITEM_FLAG, type PostItem } from '../lib/feed';
import type { DayKey } from '../lib/dates';
import { touchGroupActivity, type Membership } from './groups';
import { writeDigestItem } from './posts';

export interface Author {
  uid: string;
  name: string;
  photo?: string;
}

export interface PostOutcome {
  /** How many lines were written, counting each group separately. */
  written: number;
  /** The names of groups that refused at least one line. */
  failed: string[];
}

export const NOTHING_POSTED: PostOutcome = { written: 0, failed: [] };

/** The groups this member has turned the matching category on for. */
export function groupsFor(memberships: Membership[], item: PostItem['kind']): Membership[] {
  const flag = ITEM_FLAG[item];
  return memberships.filter((membership) => membership.shareFlags?.[flag] === true);
}

/**
 * Adds lines to the member's digest in every group that should hear each one.
 *
 * Each line is routed by its own kind, so one call can carry a mixture: a
 * streak that only the groups sharing goals will see alongside a weight trend
 * that only the groups sharing stats will.
 */
export async function postItems(
  memberships: Membership[],
  author: Author,
  day: DayKey,
  items: PostItem[],
): Promise<PostOutcome> {
  if (items.length === 0) return NOTHING_POSTED;

  const base = {
    authorUid: author.uid,
    authorName: author.name,
    ...(author.photo ? { authorPhoto: author.photo } : {}),
  };

  const failed = new Set<string>();
  const touched = new Set<string>();
  let written = 0;

  for (const item of items) {
    for (const membership of groupsFor(memberships, item.kind)) {
      try {
        await writeDigestItem(membership.groupId, digestId(author.uid, day), base, item);
        written += 1;
        touched.add(membership.groupId);
      } catch {
        failed.add(membership.name);
      }
    }
  }

  // One marker per group however many lines landed, so other members get a
  // dot on the Groups tab.
  await Promise.all([...touched].map((groupId) => touchGroupActivity(groupId)));

  return { written, failed: [...failed] };
}
