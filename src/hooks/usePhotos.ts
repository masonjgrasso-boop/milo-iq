// Loading and changing the weekly progress photos.
//
// Shared by the section at the bottom of Trends and by the full timeline
// behind "See all", so both show the same list and a photo added in one
// appears in the other without a reload.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { useGroupSync } from './useGroupSync';
import { deletePhoto, listPhotos, uploadPhoto, type ProgressPhoto } from '../data/photos';
import { todayKey, toWeekKey, weekKeyLabel, type WeekKey } from '../lib/dates';

export function usePhotos() {
  const { user } = useAuth();
  const notify = useToast();
  const groups = useGroupSync();

  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const upload = useCallback(
    async (file: File | undefined) => {
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
        // Straight to the feed of any group this member shares photos with.
        groups.photo({ week: photo.week, thumbUrl: photo.thumbUrl });
      } catch (err) {
        const message =
          err instanceof Error && err.message.includes('not an image')
            ? 'That file is not an image.'
            : 'Upload failed. Check your connection and that Cloud Storage is enabled.';
        setError(message);
        notify(message, 'error');
      } finally {
        setBusy(false);
      }
    },
    [user, notify, groups],
  );

  const remove = useCallback(
    async (week: WeekKey) => {
      if (!user) return;
      const previous = photos;
      setPhotos((current) => (current ?? []).filter((photo) => photo.week !== week));
      try {
        await deletePhoto(user.uid, week);
        notify('Photo deleted');
      } catch {
        setPhotos(previous);
        notify('Could not delete that photo. Check your connection.', 'error');
      }
    },
    [user, photos, notify],
  );

  return {
    photos,
    /** This week's photo, if one has been taken. */
    existing: photos?.find((photo) => photo.week === thisWeek) ?? null,
    thisWeek,
    busy,
    error,
    upload,
    remove,
  };
}
