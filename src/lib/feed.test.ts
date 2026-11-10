import { describe, it, expect } from 'vitest';
import {
  autoPostId, nudgeId, nudgeMessage, photoPost, rulesPost, tallyReactions,
  toggleReaction, visiblePosts, weightPost, workoutPost,
  KIND_FLAG, MAX_BODY, PAGE_SIZE, REACTIONS,
  type FeedPost, type Reaction,
} from './feed';
import { lbToKg } from './units';

const post = (id: string, authorUid: string): FeedPost => ({
  id,
  authorUid,
  authorName: 'Someone',
  kind: 'note',
});

describe('automatic post ids', () => {
  it('are the same every time for the same event', () => {
    expect(autoPostId('rules', 'alice', '2026-11-09'))
      .toBe(autoPostId('rules', 'alice', '2026-11-09'));
  });

  it('separate the kind, the member and the period', () => {
    expect(autoPostId('weight', 'alice', '2026-W45')).toBe('weight_alice_2026-W45');
    expect(autoPostId('rules', 'alice', '2026-W45')).not
      .toBe(autoPostId('weight', 'alice', '2026-W45'));
    expect(autoPostId('weight', 'bob', '2026-W45')).not
      .toBe(autoPostId('weight', 'alice', '2026-W45'));
  });

  it('never contains a slash, which would split the document path', () => {
    expect(autoPostId('workout', 'alice', '2026-11-09_day1')).not.toContain('/');
  });
});

describe('which flag gates which post', () => {
  it('gates every automatic kind on the matching sharing flag', () => {
    expect(KIND_FLAG.weight).toBe('weight');
    expect(KIND_FLAG.rules).toBe('rules');
    expect(KIND_FLAG.workout).toBe('workouts');
    expect(KIND_FLAG.photo).toBe('photos');
  });

  it('gates a member’s own words on nothing but writing them', () => {
    expect(KIND_FLAG.note).toBeNull();
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
    const body = weightPost(-1, 'metric');
    expect(JSON.stringify(body)).not.toContain('80');
  });

  it('carries a spark line only when there is more than one point', () => {
    expect(weightPost(-1, 'metric', [80, 79.5]).spark).toEqual([80, 79.5]);
    expect(weightPost(-1, 'metric', [80]).spark).toBeUndefined();
    expect(weightPost(-1, 'metric').spark).toBeUndefined();
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
    const detail = workoutPost('Legs', ['A', 'B', 'C', 'D', 'E']).detail;
    expect(detail).toBe('New best on A, B, C and 2 more');
  });
});

describe('photoPost', () => {
  it('says what it is without describing the picture', () => {
    expect(photoPost('2026-W45').headline).toBe('Posted a progress photo');
  });
});

describe('visiblePosts', () => {
  it('keeps posts by current members, in order', () => {
    const posts = [post('1', 'alice'), post('2', 'bob'), post('3', 'alice')];
    expect(visiblePosts(posts, ['alice', 'bob']).map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('drops a departed member’s posts even if the delete did not finish', () => {
    // The promise is that leaving removes your posts. The batch that deletes
    // them can fail half way, so the feed refuses to render them either way.
    const posts = [post('1', 'alice'), post('2', 'bob')];
    expect(visiblePosts(posts, ['alice']).map((p) => p.id)).toEqual(['1']);
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
    // Tapping the one you already left takes it off.
    expect(toggleReaction(start, 'alice', 'fire')).toEqual({});
    // And never mutates what it was given.
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
