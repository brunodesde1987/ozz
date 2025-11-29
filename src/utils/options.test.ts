import { describe, expect, test } from 'bun:test';
import { InvoiceOptionSchema, MonthOptionSchema, UpdateOptionsSchema } from './options';

describe('InvoiceOptionSchema', () => {
  test('parses valid invoice', () => {
    const result = InvoiceOptionSchema.safeParse('2171204/310');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ cardId: 2171204, invoiceId: 310 });
    }
  });

  test('rejects invalid format', () => {
    expect(InvoiceOptionSchema.safeParse('invalid').success).toBe(false);
    expect(InvoiceOptionSchema.safeParse('123').success).toBe(false);
  });
});

describe('MonthOptionSchema', () => {
  test('parses valid month', () => {
    expect(MonthOptionSchema.safeParse('2025-01').success).toBe(true);
  });

  test('rejects invalid format', () => {
    expect(MonthOptionSchema.safeParse('2025-1').success).toBe(false);
    expect(MonthOptionSchema.safeParse('Jan 2025').success).toBe(false);
  });
});

describe('UpdateOptionsSchema', () => {
  test('accepts invoice only', () => {
    const result = UpdateOptionsSchema.safeParse({ invoice: '2171204/310' });
    expect(result.success).toBe(true);
  });

  test('accepts start and end', () => {
    const result = UpdateOptionsSchema.safeParse({ start: '2025-01', end: '2025-02' });
    expect(result.success).toBe(true);
  });

  test('rejects neither invoice nor start/end', () => {
    const result = UpdateOptionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('rejects invoice with start/end', () => {
    const result = UpdateOptionsSchema.safeParse({
      invoice: '2171204/310',
      start: '2025-01',
      end: '2025-02',
    });
    expect(result.success).toBe(false);
  });

  test('rejects start without end', () => {
    const result = UpdateOptionsSchema.safeParse({ start: '2025-01' });
    expect(result.success).toBe(false);
  });

  test('rejects account without start/end', () => {
    const result = UpdateOptionsSchema.safeParse({ account: '123', invoice: '2171204/310' });
    expect(result.success).toBe(false);
  });

  test('accepts account with start/end', () => {
    const result = UpdateOptionsSchema.safeParse({
      start: '2025-01',
      end: '2025-02',
      account: '123',
    });
    expect(result.success).toBe(true);
  });

  test('accepts boolean flags', () => {
    const result = UpdateOptionsSchema.safeParse({
      invoice: '2171204/310',
      apply: true,
      force: true,
      renameOnly: false,
      tagsOnly: false,
      debug: false,
    });
    expect(result.success).toBe(true);
  });
});
