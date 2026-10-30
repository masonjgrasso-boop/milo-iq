// Generates the PWA icon PNGs in public/ from code, so the repo carries no
// binary blobs you cannot inspect. Run with: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [5, 150, 105];      // emerald-600
const FG = [255, 255, 255];    // white "M"

// --- tiny PNG writer -------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // bytes 10-12: compression, filter, interlace — all 0

  // Each scanline is prefixed with filter type 0 (none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the mark --------------------------------------------------------------

// Distance from point p to line segment ab, used to draw strokes of real width.
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  // Glyph occupies the middle 50% so it survives maskable/"safe zone" cropping.
  const box = size * 0.5;
  const ox = (size - box) / 2;
  const oy = (size - box) / 2;
  const at = (nx, ny) => [ox + nx * box, oy + ny * box];

  // The four strokes of an "M".
  const strokes = [
    [...at(0, 1), ...at(0, 0)],
    [...at(0, 0), ...at(0.5, 0.58)],
    [...at(0.5, 0.58), ...at(1, 0)],
    [...at(1, 0), ...at(1, 1)],
  ];
  const half = size * 0.045;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let d = Infinity;
      for (const s of strokes) d = Math.min(d, distToSegment(px, py, s[0], s[1], s[2], s[3]));

      // Antialias across one pixel at the stroke edge.
      const cover = Math.max(0, Math.min(1, half - d + 0.5));
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BG[c] + (FG[c] - BG[c]) * cover);
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, drawIcon(size));
  console.log('wrote', file);
}
