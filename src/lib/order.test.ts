import { describe, it, expect } from 'vitest';
import { moveItem, renumber, nextOrder } from './order';

describe('moveItem', () => {
  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same array when nothing moves', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 1, 1)).toBe(list);
  });

  it('clamps a target past the end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });

  it('clamps a negative target', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });

  it('ignores a source that is not in the list', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 7, 0)).toBe(list);
  });

  it('leaves everything else in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd', 'e'], 3, 1)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });
});

describe('renumber', () => {
  it('closes gaps after a reorder', () => {
    const renumbered = renumber([{ id: 'a', order: 5 }, { id: 'b', order: 9 }]);
    expect(renumbered.map((item) => item.order)).toEqual([0, 1]);
  });

  it('keeps every other field', () => {
    expect(renumber([{ id: 'a', order: 3, name: 'Squat' }])[0].name).toBe('Squat');
  });

  it('does not mutate its input', () => {
    const input = [{ order: 5 }];
    renumber(input);
    expect(input[0].order).toBe(5);
  });
});

describe('nextOrder', () => {
  it('puts a new item at the end', () => {
    expect(nextOrder([{ order: 0 }, { order: 3 }])).toBe(4);
  });

  it('starts at zero for an empty list', () => {
    expect(nextOrder([])).toBe(0);
  });

  it('treats an item with no order as unplaced', () => {
    expect(nextOrder([{ order: undefined }, { order: 1 }])).toBe(2);
  });
});
