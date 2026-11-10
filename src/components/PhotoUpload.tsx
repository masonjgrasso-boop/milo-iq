// The weekly photo: the card that adds one, and a strip of recent weeks.
//
// Both appear at the bottom of Trends and at the top of the full timeline, so
// the week being filled is named in the same words wherever you meet it.

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { weekKeyLabel, type WeekKey } from '../lib/dates';
import type { ProgressPhoto } from '../data/photos';
import { Button, Card } from './ui';

export function PhotoUploadCard({ existing, thisWeek, busy, onPick }: {
  existing: ProgressPhoto | null;
  thisWeek: WeekKey;
  busy: boolean;
  onPick: (file: File | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose this week's photo"
        onChange={(event) => {
          onPick(event.target.files?.[0]);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />

      {/* The week being filled, named before the button that fills it. */}
      {existing ? (
        <img
          src={existing.thumbUrl}
          alt={`Progress photo from ${weekKeyLabel(existing.week)}`}
          className="h-[150px] w-full rounded-tile object-cover"
        />
      ) : (
        <div
          className="flex h-[150px] items-center justify-center rounded-tile border-2
            border-dashed border-line-dash font-mono text-xs text-ink-mute"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #f4f6f2 0 10px, #eef2ee 10px 20px)',
          }}
        >
          {weekKeyLabel(thisWeek)}
        </div>
      )}

      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy
          ? 'Compressing and uploading…'
          : existing
            ? 'Replace this week’s photo'
            : 'Add this week’s photo'}
      </Button>
      <p className="text-xs leading-relaxed text-ink-faint">
        Compressed on your device to about 200 KB before anything is uploaded. One photo
        per week — a second upload replaces the first.
      </p>
    </Card>
  );
}

/** A scrolling row of recent weeks, newest first, with a way to see them all. */
export function PhotoStrip({ photos, max = 8 }: {
  photos: ProgressPhoto[];
  max?: number;
}) {
  if (photos.length === 0) return null;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-ink-mute">Recent weeks</span>
        <Link to="/photos" className="text-xs font-bold text-brand hover:text-brand-hi">
          See all &rarr;
        </Link>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {photos.slice(0, max).map((photo) => (
          <li key={photo.week} className="shrink-0">
            <Link to="/photos">
              <img
                src={photo.thumbUrl}
                alt={`Progress photo from ${weekKeyLabel(photo.week)}`}
                className="h-24 w-[72px] rounded-tile object-cover"
                loading="lazy"
              />
            </Link>
            <p className="mt-1 text-center text-[11px] text-ink-mute">
              {weekKeyLabel(photo.week)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
