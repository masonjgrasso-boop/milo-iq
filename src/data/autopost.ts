// Posting on the member's behalf.
//
// The app notices things worth saying — a week's weight trend, a day's rules
// kept, a workout finished, a progress photo — and writes them into each
// group the member shares that category with. Nothing goes to a group whose
// flag is off, and the flag is read from the copy on the member's own
// pointer, so deciding where to post costs no reads at all.
//
// Every write is idempotent: the id is derived from the member, the kind and
// the period, so running the same sync twice produces the same one post.
// That is what makes it safe to call on every app open without a backend to
// keep count.

import { autoPostId, KIND_FLAG, type AutoPostBody, type PostKind } from '../lib/feed';
import type { Membership } from './groups';
import { writeAutoPost } from './posts';

export interface Author {
  uid: string;
  name: string;
  photo?: string;
}

/** The groups this member has turned the matching category on for. */
export function groupsFor(memberships: Membership[], kind: PostKind): Membership[] {
  const flag = KIND_FLAG[kind];
  if (flag === null) return memberships;
  return memberships.filter((membership) => membership.shareFlags?.[flag] === true);
}

/**
 * Writes one automatic post into every group that should hear it.
 *
 * Failures are swallowed per group on purpose. A post is a nicety; a member
 * who has just finished a workout should not see an error because one group
 * they are in has been deleted underneath them.
 */
export async function postToGroups(
  memberships: Membership[],
  author: Author,
  kind: PostKind,
  period: string,
  body: AutoPostBody,
): Promise<void> {
  const targets = groupsFor(memberships, kind);
  if (targets.length === 0) return;

  const post = {
    authorUid: author.uid,
    authorName: author.name,
    ...(author.photo ? { authorPhoto: author.photo } : {}),
    kind,
    ...body,
  };

  await Promise.all(
    targets.map((membership) =>
      writeAutoPost(membership.groupId, autoPostId(kind, author.uid, period), post)
        .catch(() => undefined),
    ),
  );
}
