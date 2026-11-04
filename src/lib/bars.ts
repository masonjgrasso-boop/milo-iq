// Bar geometry for the deficit chart.
//
// A deficit bar points away from maintenance in whichever direction the day
// went, so the rounded end is not always the top one. Recharts takes a single
// `radius` for a whole series, so the shape is drawn by hand from this path.

/**
 * A rectangle with its top and bottom corners rounded by different amounts.
 *
 * Both radii are clamped to half the width and half the height, so a one-pixel
 * bar degrades to a sliver rather than an inside-out arc.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  topRadius: number,
  bottomRadius: number,
): string {
  const limit = Math.min(width / 2, height / 2);
  const top = Math.max(0, Math.min(topRadius, limit));
  const bottom = Math.max(0, Math.min(bottomRadius, limit));

  return [
    `M${x + top},${y}`,
    `H${x + width - top}`,
    `A${top},${top} 0 0 1 ${x + width},${y + top}`,
    `V${y + height - bottom}`,
    `A${bottom},${bottom} 0 0 1 ${x + width - bottom},${y + height}`,
    `H${x + bottom}`,
    `A${bottom},${bottom} 0 0 1 ${x},${y + height - bottom}`,
    `V${y + top}`,
    `A${top},${top} 0 0 1 ${x + top},${y}`,
    'Z',
  ].join(' ');
}

/** The design rounds the end away from maintenance, and squares the end on it. */
export const BAR_RADIUS = { far: 5, near: 2 };

/** Top and bottom radii for a bar, given which side of maintenance it is on. */
export function barRadii(under: boolean): { top: number; bottom: number } {
  return under
    ? { top: BAR_RADIUS.far, bottom: BAR_RADIUS.near }
    : { top: BAR_RADIUS.near, bottom: BAR_RADIUS.far };
}
