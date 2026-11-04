// Keeping a hand-arranged list in the order its owner put it in.
//
// Shared by workout routines and personal rules, both of which are lists the
// user drags around and both of which store that arrangement as a plain
// `order` number.

/**
 * Moves one item to a new index, leaving everything else in order.
 *
 * Returns the same array when the move is a no-op, so a drag that ends where
 * it started causes no write.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;

  const target = Math.min(list.length - 1, Math.max(0, to));
  if (target === from) return list;

  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Renumbers from zero after a reorder, so the stored order has no gaps. */
export function renumber<T extends { order: number }>(list: T[]): T[] {
  return list.map((item, index) => ({ ...item, order: index }));
}

/** The next order value, so a new item lands at the end. */
export function nextOrder(list: { order?: number }[]): number {
  return list.reduce((max, item) => Math.max(max, item.order ?? -1), -1) + 1;
}
