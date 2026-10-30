import { describe, it, expect } from 'vitest';
import { escapeCsvValue, toCsvRow, toCsv } from './csv';

describe('escapeCsvValue', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvValue('oats')).toBe('oats');
    expect(escapeCsvValue(1850)).toBe('1850');
    expect(escapeCsvValue(true)).toBe('true');
  });

  it('renders null and undefined as empty', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('quotes a value containing a comma', () => {
    expect(escapeCsvValue('Beans, baked')).toBe('"Beans, baked"');
  });

  it('doubles quote marks and wraps the field', () => {
    expect(escapeCsvValue('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes values containing line breaks', () => {
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvValue('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('preserves a leading zero as text', () => {
    expect(escapeCsvValue('007')).toBe('007');
  });
});

describe('toCsvRow', () => {
  it('joins fields with commas', () => {
    expect(toCsvRow(['2026-03-04', 1850, 'ok'])).toBe('2026-03-04,1850,ok');
  });

  it('keeps column counts stable when a field contains a comma', () => {
    const row = toCsvRow(['Beans, baked', 150]);
    expect(row).toBe('"Beans, baked",150');
  });

  it('handles an empty row', () => {
    expect(toCsvRow([])).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header row followed by the data', () => {
    const csv = toCsv(['date', 'calories'], [['2026-03-04', 1850], ['2026-03-05', 2100]]);
    expect(csv).toBe('date,calories\r\n2026-03-04,1850\r\n2026-03-05,2100');
  });

  it('writes just the header when there are no rows', () => {
    expect(toCsv(['date', 'calories'], [])).toBe('date,calories');
  });
});
