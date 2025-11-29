import { describe, expect, test } from 'bun:test';
import { formatDuration, formatMoney, truncate } from './format';

describe('formatDuration', () => {
  test('formats seconds only', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(59000)).toBe('59s');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m00s');
    expect(formatDuration(65000)).toBe('1m05s');
    expect(formatDuration(125000)).toBe('2m05s');
  });

  test('formats longer durations', () => {
    expect(formatDuration(3600000)).toBe('60m00s');
  });
});

describe('formatMoney', () => {
  test('formats positive amounts', () => {
    // Use toMatch with regex to handle non-breaking space variations
    expect(formatMoney(100)).toMatch(/R\$\s?1,00/);
    expect(formatMoney(4590)).toMatch(/R\$\s?45,90/);
    expect(formatMoney(123456)).toMatch(/R\$\s?1\.234,56/);
  });

  test('formats negative amounts', () => {
    expect(formatMoney(-4590)).toMatch(/-?\s?R\$\s?-?45,90/);
  });

  test('formats zero', () => {
    expect(formatMoney(0)).toMatch(/R\$\s?0,00/);
  });
});

describe('truncate', () => {
  test('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('truncates long strings', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });
});
