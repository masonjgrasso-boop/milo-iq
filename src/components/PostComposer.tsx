// Writing a post.
//
// A few lines of text and, if they want, a picture. The picture goes through
// exactly the same compression as a progress photo — resized and squeezed on
// the device before it goes anywhere — so posting from a phone costs a fifth
// of a megabyte rather than four.

import { useRef, useState } from 'react';
import { preparePhoto, formatBytes } from '../lib/images';
import { MAX_BODY } from '../lib/feed';
import { Button, Card } from './ui';

export interface ComposedPost {
  body: string;
  image: { full: Blob; thumb: Blob } | null;
}

export function PostComposer({ busy, onPost, onCancel }: {
  busy: boolean;
  onPost: (post: ComposedPost) => Promise<void>;
  onCancel: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const [body, setBody] = useState('');
  const [image, setImage] = useState<{ full: Blob; thumb: Blob } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      setImage({ full: prepared.full, thumb: prepared.thumb });
      setPreview(URL.createObjectURL(prepared.thumb));
    } catch {
      setError('That image could not be read. Try another one.');
    } finally {
      setPreparing(false);
    }
  }

  function clearImage() {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  const tooLong = body.length > MAX_BODY;
  const ready = (body.trim().length > 0 || image !== null) && !tooLong && !preparing;

  return (
    <Card className="flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder="How did it go?"
        aria-label="Write a post"
        className="w-full resize-none rounded-input border border-line-in px-3 py-2.5 text-[15px]
          text-ink outline-none focus:border-brand"
      />

      <div className="flex items-center justify-between gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(event) => choose(event.target.files?.[0])}
          className="hidden"
          id="post-image"
        />
        <label
          htmlFor="post-image"
          className="cursor-pointer rounded-chip bg-muted px-3 py-2 text-xs font-bold
            text-ink-mute transition hover:bg-brand-wash hover:text-brand"
        >
          {preparing ? 'Compressing…' : image ? 'Change photo' : 'Add a photo'}
        </label>
        <span
          className={`text-xs tnum ${tooLong ? 'font-bold text-danger' : 'text-ink-faint'}`}
        >
          {body.length}/{MAX_BODY}
        </span>
      </div>

      {preview && image && (
        <div className="flex items-center gap-3">
          <img src={preview} alt="" className="h-16 w-16 rounded-tile object-cover" />
          <span className="text-xs text-ink-mute">
            {formatBytes(image.full.size)} after compression
          </span>
          <button
            type="button"
            onClick={clearImage}
            className="ml-auto text-xs font-bold text-ink-off transition hover:text-danger"
          >
            Remove
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2.5">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => onPost({ body: body.trim(), image })}
          disabled={!ready || busy}
        >
          {busy ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </Card>
  );
}
