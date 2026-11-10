// "Someone nudged you."
//
// Deliberately warm rather than scolding. A nudge means a person in your
// group noticed you had gone quiet, which is the thing you joined a group
// for — so it reads as a hand on the shoulder, and it clears the moment you
// log anything.

import { nudgeMessage, type Nudge } from '../lib/feed';
import { Card } from './ui';

export function NudgeBanner({ nudges, onDismiss }: {
  nudges: Nudge[];
  onDismiss: (nudge: Nudge) => void;
}) {
  if (nudges.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {nudges.map((nudge) => (
        <Card key={nudge.id} tone="wash" className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
              bg-brand text-sm text-white"
          >
            &#x1F44B;
          </span>
          <p className="min-w-0 flex-1 text-sm text-brand">{nudgeMessage(nudge)}</p>
          <button
            type="button"
            aria-label="Dismiss this nudge"
            onClick={() => onDismiss(nudge)}
            className="shrink-0 rounded-chip px-2 py-1 text-brand transition hover:bg-brand-pill"
          >
            &times;
          </button>
        </Card>
      ))}
    </div>
  );
}
