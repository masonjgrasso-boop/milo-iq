// Minimal CSV writing for the data export.
//
// Hand-rolled rather than pulling in a dependency: the whole job is quoting,
// and getting the quoting right is the only thing that matters.

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Quotes a single field.
 *
 * A field is wrapped in quotes when it contains a comma, a quote mark or a
 * line break, and any quote inside is doubled. Without this, one food named
 * "Beans, baked" silently shifts every later column.
 */
export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvRow(values: CsvValue[]): string {
  return values.map(escapeCsvValue).join(',');
}

/** A whole CSV file, with a header row, using CRLF as the spec requires. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
}
