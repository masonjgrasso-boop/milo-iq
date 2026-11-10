// "What do you want to share with this group?"
//
// The same three checkboxes in both places they are asked: before somebody
// joins, and in the group's Sharing tab afterwards. One component, so the
// wording and the defaults cannot differ between the question and the answer.

import {
  SHARE_DESCRIPTIONS, SHARE_LABELS, type ShareFlags, type ShareKey,
} from '../lib/groups';

export function ShareChoices({ flags, keys, onToggle }: {
  flags: ShareFlags;
  /** Which of them to show: the three at join, all four in settings. */
  keys: ShareKey[];
  onToggle: (key: ShareKey) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line-soft">
      {keys.map((key) => (
        <li key={key} className="py-3 first:pt-0 last:pb-0">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={() => onToggle(key)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-in accent-brand"
            />
            <span>
              <span className="block text-sm font-bold text-ink">{SHARE_LABELS[key]}</span>
              <span className="block text-xs text-ink-mute">{SHARE_DESCRIPTIONS[key]}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
