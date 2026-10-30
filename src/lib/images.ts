// Preparing a progress photo for upload.
//
// All of this happens on the device before anything is sent. A modern phone
// camera produces a 4MB photo; storing those directly would cost real money
// and make the timeline slow to load. Compressing to roughly 200KB plus a
// small thumbnail keeps a year of weekly photos comfortably inside the free
// Storage tier.

import imageCompression from 'browser-image-compression';

/** Roughly the target size of a full-size progress photo. */
export const FULL_TARGET_MB = 0.2;
export const FULL_MAX_DIMENSION = 1280;

/** The thumbnail shown in the timeline grid. */
export const THUMB_TARGET_MB = 0.02;
export const THUMB_MAX_DIMENSION = 240;

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  fullBytes: number;
  thumbBytes: number;
}

/**
 * Compresses a chosen photo into a full-size image and a thumbnail.
 *
 * The thumbnail is generated from the already-compressed full image rather
 * than the original, which is both faster and keeps the two consistent.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image');
  }

  const full = await imageCompression(file, {
    maxSizeMB: FULL_TARGET_MB,
    maxWidthOrHeight: FULL_MAX_DIMENSION,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });

  const thumb = await imageCompression(full as File, {
    maxSizeMB: THUMB_TARGET_MB,
    maxWidthOrHeight: THUMB_MAX_DIMENSION,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });

  return { full, thumb, fullBytes: full.size, thumbBytes: thumb.size };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
