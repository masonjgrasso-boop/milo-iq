// The two-user feed flow, against the emulator and the real rules.
//
// B opts into a group, keeps all of today's rules, finishes a workout, hits a
// logging streak, uploads a photo and gets a weekly report. A, in the same
// group, reads the feed. Everything runs through the functions the app itself
// calls — src/data/groupFeed, src/data/autopost, src/data/posts — pointed at
// the emulator by the one seam in src/lib/firebase, so a missing rule, a
// rejected query or a shape the rules refuse shows up here rather than as a
// feed that stays empty on a phone.
//
// The one thing it cannot do is the Cloud Storage half of a photo upload:
// preparePhoto needs a canvas. The thumbnail is therefore handed in as the
// upload would produce it, and Storage's own rules are covered by
// storage.test.ts.

import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, setDoc, where, type Firestore,
} from 'firebase/firestore';
import { setDbForTests } from '../../src/lib/firebase';
import {
  createGroup, joinGroup, listMembers, listMyGroups, updateShareFlags,
} from '../../src/data/groups';
import { addComment, listComments, listPosts, pruneAuthorItems } from '../../src/data/posts';
import { postItems } from '../../src/data/autopost';
import { postRulesKept, postWeeklyStats } from '../../src/data/groupFeed';
import { digestId, itemsFor, workoutPost, type FeedPost } from '../../src/lib/feed';
import { DEFAULT_SHARING, NO_SHARING } from '../../src/lib/groups';
import { addDays, startOfWeek, todayKey, toWeekKey } from '../../src/lib/dates';
import type { DayLog, Rule, UserProfile } from '../../src/lib/types';

const ALICE = 'alice';
const BOB = 'bob';

const today = todayKey();

let testEnv: RulesTestEnvironment;

const profile: UserProfile = {
  units: 'imperial',
  heightCm: 178,
  weightKg: 80,
  age: 30,
  sex: 'male',
  goal: 'lose',
  activity: 'light',
  targetRateKgPerWeek: 0.45,
  calorieTarget: 2000,
};

const author = (uid: string, name: string) => ({ uid, name });

/** Runs a body with every data module pointed at one user's Firestore. */
async function as<T>(db: Firestore, body: () => Promise<T>): Promise<T> {
  setDbForTests(db);
  try {
    return await body();
  } finally {
    setDbForTests(undefined);
  }
}

const aliceDb = () => testEnv.authenticatedContext(ALICE).firestore() as unknown as Firestore;
const bobDb = () => testEnv.authenticatedContext(BOB).firestore() as unknown as Firestore;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'milo-iq-feed-flow',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  setDbForTests(undefined);
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Alice makes a group; Bob joins it with the sharing he chose. */
async function setUpGroup(bobShares = { stats: true, goals: true, photos: true }) {
  const group = await as(aliceDb(), () =>
    createGroup(ALICE, 'Alice', 'Morning crew', { ...DEFAULT_SHARING, goals: true }),
  );

  await as(bobDb(), () =>
    joinGroup(BOB, 'Bob', group.inviteCode, { ...DEFAULT_SHARING, ...bobShares }),
  );

  return group;
}

/** Bob's view of his own memberships, which is what posting reads. */
async function bobMemberships() {
  return as(bobDb(), () => listMyGroups(BOB));
}

describe('joining', () => {
  it('writes the sharing choices made before joining', async () => {
    const group = await setUpGroup({ stats: true, goals: false, photos: false });

    const members = await as(aliceDb(), () => listMembers(group.id));
    const bob = members.find((member) => member.uid === BOB);

    expect(bob).toBeDefined();
    expect(bob?.role).toBe('member');
    expect(bob?.shareFlags).toEqual({
      stats: true, goals: false, photos: false, activity: true,
    });
  });

  it('lets the admin see the new member, and the member see the admin', async () => {
    const group = await setUpGroup();
    const seenByBob = await as(bobDb(), () => listMembers(group.id));
    expect(seenByBob.map((member) => member.uid).sort()).toEqual([ALICE, BOB]);
  });
});

describe('what B does, A sees', () => {
  const rules: Rule[] = [
    {
      id: 'r1', name: 'No weekday drinking', type: 'boolean', target: 0,
      daysOfWeek: [], active: true, startDate: today,
    },
    {
      id: 'r2', name: '10k steps', type: 'numeric', target: 10_000, unit: 'steps',
      daysOfWeek: [], active: true, startDate: today,
    },
  ];

  const keptDay: DayLog = {
    date: today,
    calories: 1900,
    entries: [],
    rules: { r1: true, r2: 10_000 },
  };

  it('posts today’s rules once they are all kept, and A can read them', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    const outcome = await as(bobDb(), () =>
      postRulesKept({ uid: BOB, author: author(BOB, 'Bob'), profile, memberships }, rules, keptDay),
    );
    expect(outcome.failed).toEqual([]);
    expect(outcome.written).toBe(1);

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0].authorUid).toBe(BOB);
    expect(page.posts[0].items?.rules?.headline).toBe('Hit all 2 rules today');
  });

  it('posts nothing while a rule is still outstanding', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    const outcome = await as(bobDb(), () =>
      postRulesKept(
        { uid: BOB, author: author(BOB, 'Bob'), profile, memberships },
        rules,
        { ...keptDay, rules: { r1: true } },
      ),
    );
    expect(outcome.written).toBe(0);

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(0);
  });

  it('gathers a workout, the rules and a photo onto one card', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();
    const input = { uid: BOB, author: author(BOB, 'Bob'), profile, memberships };

    await as(bobDb(), async () => {
      await postRulesKept(input, rules, keptDay);
      await postItems(memberships, input.author, today, [
        workoutPost('Day 1: Legs', ['Squat']),
      ]);
      await postItems(memberships, input.author, today, [
        { kind: 'photo', headline: 'Posted a progress photo', thumbUrl: 'https://x.test/t.jpg' },
      ]);
    });

    const page = await as(aliceDb(), () => listPosts(group.id));

    // One card, not three. This is the anti-spam promise.
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0].id).toBe(digestId(BOB, today));

    const items = page.posts[0].items ?? {};
    expect(Object.keys(items).sort()).toEqual(['photo', 'rules', 'workout']);
    expect(items.workout?.detail).toBe('New best on Squat');
  });

  it('never duplicates when the same thing is posted twice', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();
    const input = { uid: BOB, author: author(BOB, 'Bob'), profile, memberships };

    await as(bobDb(), async () => {
      await postRulesKept(input, rules, keptDay);
      await postRulesKept(input, rules, keptDay);
      await postRulesKept(input, rules, keptDay);
    });

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(1);
    expect(Object.keys(page.posts[0].items ?? {})).toEqual(['rules']);
  });

  it('posts only to the categories B opted into', async () => {
    // Goals on, stats and photos off.
    const group = await setUpGroup({ stats: false, goals: true, photos: false });
    const memberships = await bobMemberships();
    const input = { uid: BOB, author: author(BOB, 'Bob'), profile, memberships };

    await as(bobDb(), async () => {
      await postRulesKept(input, rules, keptDay);
      // A stats line, which this group was not given.
      await postItems(memberships, input.author, today, [
        { kind: 'weight', headline: 'Down 1.4 lb this week' },
      ]);
      await postItems(memberships, input.author, today, [
        { kind: 'photo', headline: 'Posted a progress photo' },
      ]);
    });

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(1);
    expect(Object.keys(page.posts[0].items ?? {})).toEqual(['rules']);
  });

  it('posts nothing at all to a group B shares nothing with', async () => {
    const group = await setUpGroup({ stats: false, goals: false, photos: false });
    const memberships = await bobMemberships();
    const input = { uid: BOB, author: author(BOB, 'Bob'), profile, memberships };

    await as(bobDb(), () => postRulesKept(input, rules, keptDay));

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(0);
  });
});

describe('the weekly report', () => {
  /** A fortnight of logging, so last week is complete and weighed. */
  function fortnight(): DayLog[] {
    const start = addDays(startOfWeek(today), -7);
    return Array.from({ length: 14 }, (_, index) => ({
      date: addDays(start, index),
      calories: 1900,
      entries: [],
      weightKg: 80 - index * 0.1,
    }));
  }

  async function seedBobsDays(days: DayLog[]) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const day of days) {
        await setDoc(doc(db, 'users', BOB, 'days', day.date), day);
      }
    });
  }

  it('posts the weight trend and the calorie average once a week', async () => {
    const group = await setUpGroup({ stats: true, goals: false, photos: false });
    await seedBobsDays(fortnight());
    const memberships = await bobMemberships();
    const input = { uid: BOB, author: author(BOB, 'Bob'), profile, memberships };

    const first = await as(bobDb(), () => postWeeklyStats(input));
    expect(first.failed).toEqual([]);
    expect(first.written).toBeGreaterThan(0);

    const page = await as(aliceDb(), () => listPosts(group.id));
    const items = page.posts[0]?.items ?? {};
    expect(items.weight?.headline).toMatch(/lb this week/);
    expect(items.calorieAvg?.headline).toMatch(/^Averaged /);

    // Opening the app again the same week posts nothing further, because the
    // week it went out for is now recorded on the pointer.
    const refreshed = await bobMemberships();
    const again = await as(bobDb(), () =>
      postWeeklyStats({ ...input, memberships: refreshed }),
    );
    expect(again.written).toBe(0);
  });

  it('records the week it went out for, so a second device agrees', async () => {
    const group = await setUpGroup({ stats: true, goals: false, photos: false });
    await seedBobsDays(fortnight());
    const memberships = await bobMemberships();

    await as(bobDb(), () =>
      postWeeklyStats({ uid: BOB, author: author(BOB, 'Bob'), profile, memberships }),
    );

    const fresh = await bobMemberships();
    expect(fresh.find((m) => m.groupId === group.id)?.lastStatsWeek).toBe(toWeekKey(today));
  });
});

describe('comments and the thirty-day window', () => {
  it('lets A comment on B’s post and both read it back', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    await as(bobDb(), () =>
      postItems(memberships, author(BOB, 'Bob'), today, [workoutPost('Legs')]),
    );

    const postId = digestId(BOB, today);
    await as(aliceDb(), () =>
      addComment(group.id, postId, { authorUid: ALICE, authorName: 'Alice', text: 'Strong' }),
    );

    const seenByBob = await as(bobDb(), () => listComments(group.id, postId));
    expect(seenByBob).toHaveLength(1);
    expect(seenByBob[0].text).toBe('Strong');
  });

  it('gives every post and comment an expiry inside the window', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    await as(bobDb(), () =>
      postItems(memberships, author(BOB, 'Bob'), today, [workoutPost('Legs')]),
    );
    await as(aliceDb(), () =>
      addComment(group.id, digestId(BOB, today), {
        authorUid: ALICE, authorName: 'Alice', text: 'Nice',
      }),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const post = await getDoc(doc(db, 'groups', group.id, 'posts', digestId(BOB, today)));
      const data = post.data();
      expect(data).toBeDefined();

      const expiresAt = (data?.expiresAt as { toDate: () => Date } | undefined)?.toDate();
      expect(expiresAt).toBeDefined();

      const days = ((expiresAt as Date).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(31);

      const comments = await getDocs(
        collection(db, 'groups', group.id, 'posts', digestId(BOB, today), 'comments'),
      );
      expect(comments.docs).toHaveLength(1);
      expect(comments.docs[0].data().expiresAt).toBeDefined();
    });
  });

  it('leaves a post older than the window out of the feed', async () => {
    const group = await setUpGroup();

    // A post from forty days ago, written past the rules so the date sticks.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', group.id, 'posts', 'ancient'),
        {
          authorUid: BOB,
          authorName: 'Bob',
          kind: 'digest',
          items: { workout: { kind: 'workout', headline: 'Finished Legs' } },
          createdAt: new Date(Date.now() - 40 * 86_400_000),
          expiresAt: new Date(Date.now() - 10 * 86_400_000),
        },
      );
    });

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts.map((post) => post.id)).not.toContain('ancient');
  });
});

describe('turning a category off afterwards', () => {
  it('takes that category’s lines and leaves the rest', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    await as(bobDb(), async () => {
      await postItems(memberships, author(BOB, 'Bob'), today, [
        workoutPost('Legs'),
        { kind: 'weight', headline: 'Down 1.4 lb this week' },
      ]);
      await updateShareFlags(BOB, group.id, { ...NO_SHARING, stats: true, activity: true });
      await pruneAuthorItems(group.id, BOB, itemsFor('goals'));
    });

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(1);
    expect(Object.keys(page.posts[0].items ?? {})).toEqual(['weight']);
  });

  it('removes the card entirely when nothing is left on it', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();

    await as(bobDb(), async () => {
      await postItems(memberships, author(BOB, 'Bob'), today, [workoutPost('Legs')]);
      await pruneAuthorItems(group.id, BOB, itemsFor('goals'));
    });

    const page = await as(aliceDb(), () => listPosts(group.id));
    expect(page.posts).toHaveLength(0);
  });
});

describe('the filter by member', () => {
  it('narrows the feed to one person', async () => {
    const group = await setUpGroup();
    const bobsGroups = await bobMemberships();
    const alicesGroups = await as(aliceDb(), () => listMyGroups(ALICE));

    await as(bobDb(), () =>
      postItems(bobsGroups, author(BOB, 'Bob'), today, [workoutPost('Legs')]),
    );
    await as(aliceDb(), () =>
      postItems(alicesGroups, author(ALICE, 'Alice'), today, [workoutPost('Push')]),
    );

    const all = await as(aliceDb(), () => listPosts(group.id));
    expect(all.posts).toHaveLength(2);

    const justBob = await as(aliceDb(), () => listPosts(group.id, { author: BOB }));
    expect(justBob.posts).toHaveLength(1);
    expect(justBob.posts[0].authorUid).toBe(BOB);
  });
});

describe('what an outsider gets', () => {
  it('cannot read the feed, however it is queried', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();
    await as(bobDb(), () =>
      postItems(memberships, author(BOB, 'Bob'), today, [workoutPost('Legs')]),
    );

    const carol = testEnv.authenticatedContext('carol').firestore();
    await expect(
      getDocs(query(collection(carol, 'groups', group.id, 'posts'))),
    ).rejects.toThrow();
    await expect(
      getDocs(query(
        collection(carol, 'groups', group.id, 'posts'),
        where('authorUid', '==', BOB),
      )),
    ).rejects.toThrow();
  });
});

describe('the shape the feed returns', () => {
  it('hands back ids and items ready to render', async () => {
    const group = await setUpGroup();
    const memberships = await bobMemberships();
    await as(bobDb(), () =>
      postItems(memberships, author(BOB, 'Bob'), today, [workoutPost('Legs', ['Squat'])]),
    );

    const page = await as(aliceDb(), () => listPosts(group.id));
    const post: FeedPost = page.posts[0];

    expect(post.id).toBe(digestId(BOB, today));
    expect(post.kind).toBe('digest');
    expect(post.authorName).toBe('Bob');
    expect(page.more).toBe(false);
  });
});
