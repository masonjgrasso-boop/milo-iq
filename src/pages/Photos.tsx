import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { deletePhoto, listPhotos, uploadPhoto, type ProgressPhoto } from '../data/photos';
import { formatBytes } from '../lib/images';
import { todayKey, toWeekKey, weekKeyLabel, type WeekKey } from '../lib/dates';
import { Button, Card } from '../components/ui';
import { Page } from '../components/Layout';

export function Photos() {
  const { user } = useAuth();
  const notify = useToast();
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState<WeekKey[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const thisWeek = toWeekKey(todayKey());

  useEffect(() => {
    if (!user) return;
    listPhotos(user.uid)
      .then(setPhotos)
      .catch(() => {
        setPhotos([]);
        setError(
          'Could not load photos. If this is a fresh project, Cloud Storage may not be ' +
            'switched on yet — see the README.',
        );
      });
  }, [user]);

  const existing = photos?.find((photo) => photo.week === thisWeek) ?? null;

  async function handleFile(file: File | undefined) {
    if (!file || !user) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await uploadPhoto(user.uid, todayKey(), file);
      setPhotos((current) => [
        photo,
        ...(current ?? []).filter((item) => item.week !== photo.week),
      ]);
      notify(`Photo saved for ${weekKeyLabel(photo.week)}`);
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('not an image')
          ? 'That file is not an image.'
          : 'Upload failed. Check your connection and that Cloud Storage is enabled.';
      setError(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(week: WeekKey) {
    if (!user) return;
    const previous = photos;
    setPhotos((current) => (current ?? []).filter((photo) => photo.week !== week));
    setCompare((current) => current.filter((item) => item !== week));
    try {
      await deletePhoto(user.uid, week);
      notify('Photo deleted');
    } catch {
      setPhotos(previous);
      notify('Could not delete that photo. Check your connection.', 'error');
    }
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
    <Page title="Photos" subtitle="One a week. The mirror lies; these do not.">
      <Card>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy
            ? 'Compressing and uploading…'
            : existing
              ? 'Replace this week’s photo'
              : 'Add this week’s photo'}
        </Button>
        <p className="mt-2 text-xs text-slate-500">
          Compressed on your device to about 200 KB before anything is uploaded. One photo
          per week — a second upload replaces the first.
        </p>
      </Card>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {comparing.length === 2 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Side by side</h2>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              {comparing.map((photo) => (
                <figure key={photo.week}>
                  <img
                    src={photo.fullUrl}
                    alt={`Progress photo from ${photo.week}`}
                    className="aspect-[3/4] w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                  <figcaption className="mt-1.5 text-center text-xs text-slate-500">
                    {weekKeyLabel(photo.week)}
                  </figcaption>
                </figure>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCompare([])}
              className="mt-3 w-full text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Clear comparison
            </button>
          </Card>
        </>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Timeline</h2>
      {photos === null ? (
        <Card>
          <p className="text-sm text-slate-400">Loading…</p>
        </Card>
      ) : photos.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No photos yet. Weekly photos show change that the scale misses entirely —
            especially in the weeks where the number refuses to move.
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">
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
                      className={`aspect-[3/4] w-full rounded-xl object-cover transition ${
                        selected ? 'ring-2 ring-brand-600' : ''
                      }`}
                      loading="lazy"
                    />
                  </button>
                  <p className="mt-1 text-center text-[11px] text-slate-500">
                    {weekKeyLabel(photo.week)}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleCompare(photo.week)}
                    className={`mt-0.5 w-full rounded-lg py-1 text-[11px] font-medium transition ${
                      selected
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
          className="fixed inset-0 z-20 flex flex-col bg-slate-900/95 p-4"
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
            className="mt-3 min-h-0 flex-1 rounded-xl object-contain"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>{formatBytes(viewing.bytes)}</span>
            <button
              type="button"
              onClick={() => {
                handleDelete(viewing.week);
                setViewing(null);
              }}
              className="rounded-lg px-3 py-1.5 font-medium text-red-300 hover:bg-white/10"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}
