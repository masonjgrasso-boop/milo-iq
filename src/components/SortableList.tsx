// Drag to reorder, with no dependency and no mouse required.
//
// HTML5 drag-and-drop never fires on touch, so this uses pointer events and
// pointer capture instead: one grip per row, dragged with a thumb. The list
// re-renders in the previewed order as you cross each row, so what you see is
// what you will get rather than a floating ghost.
//
// The grip is also a button that takes arrow keys, so the same reorder works
// from a keyboard and for anyone who cannot drag.

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { moveItem } from '../lib/order';

/** Spread onto whatever the row uses as its grip. */
export interface DragHandleProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  style: { touchAction: 'none' };
}

/** Falls back to this row height if measuring fails for any reason. */
const ASSUMED_ROW_HEIGHT = 56;

export function SortableList<T>({ items, keyOf, onReorder, renderItem, gap = 8 }: {
  items: T[];
  keyOf: (item: T) => string;
  /** Called once, on release, with the move the user actually made. */
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, handle: DragHandleProps, dragging: boolean) => ReactNode;
  /** Vertical gap between rows, so the drag step matches what is on screen. */
  gap?: number;
}) {
  // The grab point and row pitch live in state beside the indices, so nothing
  // here reaches for a ref while rendering.
  const [drag, setDrag] = useState<{
    from: number;
    to: number;
    startY: number;
    step: number;
  } | null>(null);

  // While dragging, show the list as it would end up.
  const preview = drag ? moveItem(items, drag.from, drag.to) : items;
  const movingKey = drag ? keyOf(items[drag.from]) : null;

  function handleFor(index: number): DragHandleProps {
    return {
      style: { touchAction: 'none' },

      onPointerDown: (event) => {
        const grip = event.currentTarget;
        const row = grip.closest('[data-sortable-row]');
        const height = row?.getBoundingClientRect().height ?? 0;
        setDrag({
          from: index,
          to: index,
          startY: event.clientY,
          step: height > 0 ? height + gap : ASSUMED_ROW_HEIGHT,
        });
        grip.setPointerCapture?.(event.pointerId);
      },

      onPointerMove: (event) => {
        if (!drag) return;
        const shift = Math.round((event.clientY - drag.startY) / drag.step);
        const to = Math.min(items.length - 1, Math.max(0, drag.from + shift));
        if (to !== drag.to) setDrag({ ...drag, to });
      },

      onPointerUp: () => {
        if (!drag) return;
        if (drag.to !== drag.from) onReorder(drag.from, drag.to);
        setDrag(null);
      },

      onPointerCancel: () => setDrag(null),

      onKeyDown: (event) => {
        const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (direction === 0) return;
        event.preventDefault();
        const to = index + direction;
        if (to < 0 || to >= items.length) return;
        onReorder(index, to);
      },
    };
  }

  return (
    <ul className="space-y-2">
      {preview.map((item) => {
        const key = keyOf(item);
        // The handle belongs to the item's real position, not its previewed one.
        const index = items.findIndex((candidate) => keyOf(candidate) === key);
        return (
          <li key={key} data-sortable-row>
            {renderItem(item, handleFor(index), key === movingKey)}
          </li>
        );
      })}
    </ul>
  );
}

/** The grip itself: six dots, a big tap target, and keyboard reorder. */
export function DragHandle({ handle, label }: { handle: DragHandleProps; label: string }) {
  return (
    <button
      type="button"
      {...handle}
      aria-label={`Reorder ${label}. Use the arrow keys, or drag.`}
      className="-ml-1 flex h-11 w-9 shrink-0 cursor-grab touch-none items-center
        justify-center rounded-lg text-slate-400 active:cursor-grabbing
        active:bg-slate-100 hover:text-slate-600"
    >
      <svg viewBox="0 0 10 16" className="h-4 w-2.5" aria-hidden="true" fill="currentColor">
        <circle cx="2" cy="3" r="1.4" />
        <circle cx="8" cy="3" r="1.4" />
        <circle cx="2" cy="8" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="2" cy="13" r="1.4" />
        <circle cx="8" cy="13" r="1.4" />
      </svg>
    </button>
  );
}
