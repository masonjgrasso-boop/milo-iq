// The full photo timeline, and the side-by-side compare.
//
// Reached from the Progress photos section at the foot of Trends rather than
// from a tab of its own: adding this week's photo and glancing at the last
// few is something you do in passing, but going back through the whole lot is
// something you set out to do.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePhotos } from '../hooks/usePhotos';
import { type ProgressPhoto } from '../data/photos';
import { formatBytes } from '../lib/images';
import { weekKeyLabel, type WeekKey } from '../lib/dates';
import { Card, Eyebrow } from '../components/ui';
import { PhotoUploadCard } from '../components/PhotoUpload';
import { Page } from '../components/Layout';

export function Photos() {
  const { photos, existing, thisWeek, busy, error, upload, remove } = usePhotos();
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState<WeekKey[]>([]);

  async function handleDelete(week: WeekKey) {
    setCompare((current) => current.filter((item) => item !== week));
    await remove(week);
  }

  function toggleCompare(week: WeekKey) {
    setCompare((current) => {
      if (current.includes(week)) return current.filter((item) => item !== week);
      // Keep the two most recent choices, dropping the oldest.
      return [...current, week].slice(-2);
    });
  }

  const comparing = compare
    .map((week) => (photos ?? []).find((photo) => photo.week === week))
    .filter((photo): photo is ProgressPhoto => photo !== undefined)
    .sort((a, b) => a.week.localeCompare(b.week));

  return (
    <Page
      eyebrow="Once a week"
      title="Photos"
      subtitle="The mirror lies; these do not."
      back={
        <Link to="/trends" className="text-[13px] font-bold text-ink-mute hover:text-ink-soft">
          &larr; Trends
        </Link>
      }
    >
      <PhotoUploadCard
        existing={existing}
        thisWeek={thisWeek}
        busy={busy}
        onPick={upload}
      />

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {comparing.length === 2 && (
        <>
          <Eyebrow>Side by side</Eyebrow>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              {comparing.map((photo) => (
                <figure key={photo.week}>
                  <img
                    src={photo.fullUrl}
                    alt={`Progress photo from ${photo.week}`}
                    className="aspect-[3/4] w-full rounded-input object-cover"
                    loading="lazy"
                  />
                  <figcaption className="mt-1.5 text-center text-xs text-ink-mute">
                    {weekKeyLabel(photo.week)}
                  </figcaption>
                </figure>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCompare([])}
              className="mt-3 w-full text-sm font-medium text-ink-mute hover:text-ink-soft"
            >
              Clear comparison
            </button>
          </Card>
        </>
      )}

      <Eyebrow>Timeline</Eyebrow>
      {photos === null ? (
        <Card>
          <p className="text-sm text-ink-ghost">Loading…</p>
        </Card>
      ) : photos.length === 0 ? (
        <Card tone="cream" className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="aspect-[3/4] rounded-chip border-[1.5px] border-dashed border-cream-line"
              />
            ))}
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            No photos yet. Weekly photos show change that the scale misses entirely —
            especially in the weeks where the number refuses to move.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-ink-faint">
            Tap a photo to view it full size, or use Compare on any two weeks.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => {
              const selected = compare.includes(photo.week);
              return (
                <div key={photo.week} className="relative">
                  <button
                    type="button"
                    onClick={() => setViewing(photo)}
                    className="block w-full"
                  >
                    <img
                      src={photo.thumbUrl}
                      alt={`Progress photo from ${weekKeyLabel(photo.week)}`}
                      className={`aspect-[3/4] w-full rounded-chip object-cover transition ${
                        selected ? 'ring-2 ring-brand' : ''
                      }`}
                      loading="lazy"
                    />
                  </button>
                  <p className="mt-1 text-center text-[11px] text-ink-mute">
                    {weekKeyLabel(photo.week)}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleCompare(photo.week)}
                    className={`mt-0.5 w-full rounded-lg py-1 text-[11px] font-bold transition ${
                      selected
                        ? 'bg-brand text-white'
                        : 'bg-brand-wash text-ink-soft hover:bg-brand-pill'
                    }`}
                  >
                    {selected ? 'Selected' : 'Compare'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-20 flex flex-col bg-ink/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Progress photo"
        >
          <div className="flex items-center justify-between text-white">
            <span className="text-sm font-medium">{weekKeyLabel(viewing.week)}</span>
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <img
            src={viewing.fullUrl}
            alt={`Progress photo from ${weekKeyLabel(viewing.week)}`}
            className="mt-3 min-h-0 flex-1 rounded-input object-contain"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-ink-off">
            <span>{formatBytes(viewing.bytes)}</span>
            <button
              type="button"
              onClick={() => {
                handleDelete(viewing.week);
                setViewing(null);
              }}
              className="rounded-lg px-3 py-1.5 font-medium text-cream-line hover:bg-white/10"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}
