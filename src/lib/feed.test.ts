import { describe, it, expect } from 'vitest';
import {
  calorieAvgPost, calorieWeekPost, digestId, digestItems, expiryFrom, feedCutoff,
  itemsFor, loggingStreak, milestonePost, milestonesReached, milestoneStepKg, nudgeId,
  nudgeMessage, photoPost, rulesPost, streakMilestone, streakPost, tallyReactions,
  toggleReaction, visiblePosts, weightPost, withoutItems, workoutPost,
  FEED_DAYS, ITEM_FLAG, ITEM_ORDER, MAX_BODY, MILESTONE_KG, MILESTONE_LB, PAGE_SIZE,
  REACTIONS, STREAK_MILESTONES, WEEKLY_ITEMS,
  type FeedPost, type ItemKind, type PostItem, type Reaction,
} from './feed';
import { lbToKg } from './units';

const post = (id: string, authorUid: string): FeedPost => ({
  id,
  authorUid,
  authorName: 'Someone',
  kind: 'note',
});

const day = (date: string, calories: number) => ({ date, calories });

describe('the digest', () => {
  it('is one card per member per day, which is the whole anti-spam trick', () => {
    expect(digestId('alice', '2026-11-09')).toBe(digestId('alice', '2026-11-09'));
    expect(digestId('alice', '2026-11-09')).not.toBe(digestId('alice', '2026-11-10'));
    expect(digestId('bob', '2026-11-09')).not.toBe(digestId('alice', '2026-11-09'));
  });

  it('never contains a slash, which would split the document path', () => {
    expect(digestId('alice', '2026-11-09')).not.toContain('/');
  });

  it('reads its lines in a fixed order, best news first', () => {
    const digest: FeedPost = {
      ...post('d1', 'alice'),
      kind: 'digest',
      items: {
        weight: weightPost(-0.5, 'metric'),
        milestone: milestonePost(1, 'metric', 'lose'),
        workout: workoutPost('Legs'),
      },
    };
    expect(digestItems(digest).map((item) => item.kind))
      .toEqual(['milestone', 'workout', 'weight']);
  });

  it('orders every kind it knows about', () => {
    expect([...ITEM_ORDER].sort()).toEqual(
      (Object.keys(ITEM_FLAG) as ItemKind[]).sort(),
    );
  });

  it('is empty rather than broken for a digest with no lines', () => {
    expect(digestItems({ ...post('d2', 'alice'), kind: 'digest' })).toEqual([]);
    expect(digestItems({ ...post('d3', 'alice'), kind: 'digest', items: {} })).toEqual([]);
  });

  it('skips a line that arrived without a headline', () => {
    const odd = { weight: { kind: 'weight' } as unknown as PostItem };
    expect(digestItems({ ...post('d4', 'alice'), kind: 'digest', items: odd })).toEqual([]);
  });
});

describe('which flag gates which line', () => {
  it('puts the weekly figures under stats', () => {
    expect(ITEM_FLAG.weight).toBe('stats');
    expect(ITEM_FLAG.calorieAvg).toBe('stats');
  });

  it('puts every achievement under goals, meeting a calorie goal included', () => {
    // Reporting the week's average is a stat; hitting the goal is an
    // achievement. They are separate lines under separate flags, so somebody
    // can share the good news without sharing the number.
    expect(ITEM_FLAG.calorieWeek).toBe('goals');
    expect(ITEM_FLAG.rules).toBe('goals');
    expect(ITEM_FLAG.workout).toBe('goals');
    expect(ITEM_FLAG.milestone).toBe('goals');
    expect(ITEM_FLAG.streak).toBe('goals');
  });

  it('can name the lines a flag is responsible for', () => {
    expect(itemsFor('stats').sort()).toEqual(['calorieAvg', 'weight']);
    expect(itemsFor('goals').sort())
      .toEqual(['calorieWeek', 'milestone', 'rules', 'streak', 'workout']);
    expect(itemsFor('photos')).toEqual(['photo']);
    expect(itemsFor('activity')).toEqual([]);
  });

  it('marks exactly the two lines that are a weekly report', () => {
    expect(WEEKLY_ITEMS.sort()).toEqual(['calorieAvg', 'weight']);
    // Everything else happens when it happens.
    for (const kind of WEEKLY_ITEMS) {
      expect(ITEM_FLAG[kind]).toBe('stats');
    }
  });
});

describe('the thirty-day window', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('expires a post thirty days out', () => {
    expect(FEED_DAYS).toBe(30);
    const at = expiryFrom(now);
    expect(Math.round((at.getTime() - now.getTime()) / 86_400_000)).toBe(30);
  });

  it('cuts the feed off thirty days back', () => {
    const at = feedCutoff(now);
    expect(Math.round((now.getTime() - at.getTime()) / 86_400_000)).toBe(30);
  });

  it('puts the cutoff before the expiry of anything written now', () => {
    // Which is what makes the date filter and the TTL policy agree.
    expect(feedCutoff(now).getTime()).toBeLessThan(expiryFrom(now).getTime());
  });

  it('does not mutate the date it is given', () => {
    const original = new Date(now);
    expiryFrom(now);
    feedCutoff(now);
    expect(now.getTime()).toBe(original.getTime());
  });
});

describe('calorieAvgPost', () => {
  it('reports the average and how it sat against the goal', () => {
    const item = calorieAvgPost(2180, 2000, 6);
    expect(item.kind).toBe('calorieAvg');
    expect(item.headline).toBe('Averaged 2,180 a day this week');
    expect(item.detail).toContain('180 above their 2,000 goal');
    expect(item.detail).toContain('6 days logged');
  });

  it('reads the other way when the week came in under', () => {
    expect(calorieAvgPost(1850, 2000, 7).detail).toContain('150 below their 2,000 goal');
  });

  it('calls a near miss right on it rather than inventing a direction', () => {
    expect(calorieAvgPost(2010, 2000, 7).detail).toContain('Right on their 2,000 goal');
  });

  it('counts one day as a day', () => {
    expect(calorieAvgPost(2000, 2000, 1).detail).toContain('1 day logged');
  });

  it('posts whatever the week said, good or bad', () => {
    // The point of it being a stat rather than an achievement.
    expect(calorieAvgPost(3200, 2000, 7).headline).toBe('Averaged 3,200 a day this week');
  });
});

describe('withoutItems', () => {
  const items: Partial<Record<ItemKind, PostItem>> = {
    weight: weightPost(-0.5, 'metric'),
    workout: workoutPost('Legs'),
  };

  it('keeps the lines a flag is not responsible for', () => {
    const kept = withoutItems(items, itemsFor('goals'));
    expect(kept).not.toBeNull();
    expect(Object.keys(kept ?? {})).toEqual(['weight']);
  });

  it('reports nothing left when every line goes', () => {
    expect(withoutItems(items, ['weight', 'workout'])).toBeNull();
    expect(withoutItems(undefined, ['weight'])).toBeNull();
  });

  it('leaves the original alone', () => {
    withoutItems(items, ['weight']);
    expect(Object.keys(items).sort()).toEqual(['weight', 'workout']);
  });
});

describe('weightPost', () => {
  it('reads as a loss in the member’s own units', () => {
    expect(weightPost(-lbToKg(1.4), 'imperial').headline).toBe('Down 1.4 lb this week');
  });

  it('reads as a gain the other way', () => {
    expect(weightPost(lbToKg(0.4), 'imperial').headline).toBe('Up 0.4 lb this week');
  });

  it('uses kilograms for a metric member', () => {
    expect(weightPost(-0.6, 'metric').headline).toBe('Down 0.6 kg this week');
  });

  it('calls a tiny movement steady rather than inventing a direction', () => {
    expect(weightPost(0.01, 'metric').headline).toBe('Holding steady this week');
    expect(weightPost(0, 'metric').headline).toBe('Holding steady this week');
  });

  it('never leaks the weight itself, only the change', () => {
    expect(JSON.stringify(weightPost(-1, 'metric'))).not.toContain('80');
  });

  it('carries a spark line only when there is more than one point', () => {
    expect(weightPost(-1, 'metric', [80, 79.5]).spark).toEqual([80, 79.5]);
    expect(weightPost(-1, 'metric', [80]).spark).toBeUndefined();
  });
});

describe('rulesPost', () => {
  it('reads the way the spec puts it', () => {
    expect(rulesPost(3).headline).toBe('Hit all 3 rules today');
  });

  it('does not say "all 1"', () => {
    expect(rulesPost(1).headline).toBe('Hit their rule today');
  });
});

describe('workoutPost', () => {
  it('names the session', () => {
    expect(workoutPost('Day 1: Legs').headline).toBe('Finished Day 1: Legs');
    expect(workoutPost('Day 1: Legs').detail).toBeUndefined();
  });

  it('calls out new bests', () => {
    expect(workoutPost('Legs', ['Squat', 'Leg press']).detail)
      .toBe('New best on Squat, Leg press');
  });

  it('stops listing after three and counts the rest', () => {
    expect(workoutPost('Legs', ['A', 'B', 'C', 'D', 'E']).detail)
      .toBe('New best on A, B, C and 2 more');
  });
});

describe('calorieWeekPost', () => {
  it('says the goal was met, and how much was logged', () => {
    expect(calorieWeekPost(6).headline).toBe('Hit their calorie goal this week');
    expect(calorieWeekPost(6).detail).toBe('6 days logged');
    expect(calorieWeekPost(1).detail).toBe('1 day logged');
  });
});

describe('weight milestones', () => {
  it('steps every 2 kg for a metric member and 5 lb for an imperial one', () => {
    expect(milestoneStepKg('metric')).toBe(MILESTONE_KG);
    expect(milestoneStepKg('imperial')).toBeCloseTo(lbToKg(MILESTONE_LB), 6);
  });

  it('counts whole steps of progress toward a lose goal', () => {
    expect(milestonesReached(80, 78, 'lose', 'metric')).toBe(1);
    expect(milestonesReached(80, 77.9, 'lose', 'metric')).toBe(1);
    expect(milestonesReached(80, 76, 'lose', 'metric')).toBe(2);
  });

  it('counts the other way for a gain goal', () => {
    expect(milestonesReached(80, 82, 'gain', 'metric')).toBe(1);
    // Losing weight on a gain goal is not progress.
    expect(milestonesReached(80, 78, 'gain', 'metric')).toBe(0);
  });

  it('counts nothing before the first step is complete', () => {
    expect(milestonesReached(80, 79, 'lose', 'metric')).toBe(0);
    expect(milestonesReached(80, 80, 'lose', 'metric')).toBe(0);
    // Going the wrong way is not a negative milestone.
    expect(milestonesReached(80, 82, 'lose', 'metric')).toBe(0);
  });

  it('has no milestones at all for maintaining', () => {
    expect(milestonesReached(80, 70, 'maintain', 'metric')).toBe(0);
  });

  it('uses pounds for an imperial member', () => {
    // 5 lb is about 2.27 kg, so a 2 kg drop is not yet a milestone.
    expect(milestonesReached(80, 78, 'lose', 'imperial')).toBe(0);
    expect(milestonesReached(80, 77.6, 'lose', 'imperial')).toBe(1);
  });

  it('names the total, not the step', () => {
    expect(milestonePost(2, 'imperial', 'lose').headline).toBe('10 lb down');
    expect(milestonePost(3, 'metric', 'lose').headline).toBe('6 kg down');
    expect(milestonePost(1, 'metric', 'gain').headline).toBe('2 kg on');
  });
});

describe('logging streaks', () => {
  const run = (dates: string[]) => dates.map((date) => day(date, 2000));

  it('counts consecutive logged days up to today', () => {
    expect(loggingStreak(run(['2026-11-07', '2026-11-08', '2026-11-09']), '2026-11-09'))
      .toBe(3);
  });

  it('does not look broken before breakfast', () => {
    // Today has nothing on it yet, so the streak runs to yesterday.
    const days = [...run(['2026-11-07', '2026-11-08']), day('2026-11-09', 0)];
    expect(loggingStreak(days, '2026-11-09')).toBe(2);
  });

  it('stops at a gap', () => {
    const days = [...run(['2026-11-05', '2026-11-06']), day('2026-11-07', 0),
      ...run(['2026-11-08', '2026-11-09'])];
    expect(loggingStreak(days, '2026-11-09')).toBe(2);
  });

  it('is zero when neither today nor yesterday was logged', () => {
    expect(loggingStreak(run(['2026-11-01']), '2026-11-09')).toBe(0);
    expect(loggingStreak([], '2026-11-09')).toBe(0);
  });

  it('only celebrates the lengths worth celebrating', () => {
    expect(STREAK_MILESTONES).toEqual([7, 30, 100]);
    expect(streakMilestone(6)).toBe(0);
    expect(streakMilestone(7)).toBe(7);
    expect(streakMilestone(29)).toBe(7);
    expect(streakMilestone(30)).toBe(30);
    expect(streakMilestone(150)).toBe(100);
  });

  it('names the streak it reached', () => {
    expect(streakPost(30).headline).toBe('30 days logged in a row');
    expect(streakPost(100).detail).toBe('Three figures');
  });
});

describe('photoPost', () => {
  it('says what it is without describing the picture', () => {
    expect(photoPost('2026-W45').headline).toBe('Posted a progress photo');
    expect(photoPost('2026-W45', 'https://x.test/t.jpg').thumbUrl)
      .toBe('https://x.test/t.jpg');
    expect(photoPost('2026-W45').thumbUrl).toBeUndefined();
  });
});

describe('visiblePosts', () => {
  it('keeps posts by current members, in order', () => {
    const posts = [post('1', 'alice'), post('2', 'bob'), post('3', 'alice')];
    expect(visiblePosts(posts, ['alice', 'bob']).map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('drops a departed member’s posts even if the delete did not finish', () => {
    expect(visiblePosts([post('1', 'alice'), post('2', 'bob')], ['alice']).map((p) => p.id))
      .toEqual(['1']);
  });

  it('shows nothing when nobody is a member', () => {
    expect(visiblePosts([post('1', 'alice')], [])).toEqual([]);
  });
});

describe('reactions', () => {
  it('offers exactly the three the spec asks for', () => {
    expect(REACTIONS.map((r) => r.key)).toEqual(['thumb', 'fire', 'flex']);
  });

  it('counts each one and finds the reader’s own', () => {
    const reactions: Record<string, Reaction> = { alice: 'fire', bob: 'fire', carol: 'thumb' };
    const { counts, mine } = tallyReactions(reactions, 'bob');
    expect(counts).toEqual({ thumb: 1, fire: 2, flex: 0 });
    expect(mine).toBe('fire');
  });

  it('reports no reaction of your own when you have left none', () => {
    expect(tallyReactions({ alice: 'fire' }, 'bob').mine).toBeNull();
    expect(tallyReactions(undefined, 'bob').counts).toEqual({ thumb: 0, fire: 0, flex: 0 });
  });

  it('ignores a value that is not a reaction we know', () => {
    const odd = { alice: 'rocket' } as unknown as Record<string, Reaction>;
    expect(tallyReactions(odd, 'alice').counts).toEqual({ thumb: 0, fire: 0, flex: 0 });
  });

  it('adds, swaps and removes without touching anyone else', () => {
    const start: Record<string, Reaction> = { alice: 'fire' };
    expect(toggleReaction(start, 'bob', 'thumb')).toEqual({ alice: 'fire', bob: 'thumb' });
    expect(toggleReaction(start, 'alice', 'flex')).toEqual({ alice: 'flex' });
    expect(toggleReaction(start, 'alice', 'fire')).toEqual({});
    expect(start).toEqual({ alice: 'fire' });
  });
});

describe('nudges', () => {
  it('keys one per person per day, which is what the rules enforce', () => {
    expect(nudgeId('bob', '2026-11-09')).toBe('bob_2026-11-09');
    expect(nudgeId('bob', '2026-11-09')).not.toBe(nudgeId('bob', '2026-11-10'));
    expect(nudgeId('bob', '2026-11-09')).not.toBe(nudgeId('carol', '2026-11-09'));
  });

  it('says who sent it and what clears it', () => {
    const message = nudgeMessage({ fromName: 'Alice', groupName: 'Morning crew' });
    expect(message).toContain('Alice');
    expect(message).toContain('Morning crew');
    expect(message).toContain('Log something today');
  });
});

describe('feed limits', () => {
  it('pages twenty at a time, as asked', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it('bounds a note so one post cannot fill the screen', () => {
    expect(MAX_BODY).toBeGreaterThan(100);
    expect(MAX_BODY).toBeLessThanOrEqual(1000);
  });
});
