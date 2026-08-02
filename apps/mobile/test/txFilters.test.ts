import { describe, expect, it } from 'vitest';
import { bruneiDayKey } from '../src/lib/format';
import {
  buildTransactionOps,
  DEFAULT_FILTERS,
  defaultListFilters,
  hasAnyFilter,
  isRecentWindow,
  recentWindowStartKey,
  type TxFilters,
} from '../src/lib/txFilters';

const f = (patch: Partial<TxFilters> = {}): TxFilters => ({ ...DEFAULT_FILTERS, ...patch });

describe('no filters', () => {
  it('adds nothing at all', () => {
    expect(buildTransactionOps(f(), '')).toEqual([]);
  });
});

describe('date range', () => {
  it('bounds the range at Brunei midnight and end of day', () => {
    const ops = buildTransactionOps(f({ dateFrom: '2026-03-01', dateTo: '2026-03-31' }), '');
    expect(ops).toEqual([
      // Brunei is UTC+8 year round, so a local midnight is 16:00 the day before.
      { op: 'gte', column: 'occurred_at', value: '2026-02-28T16:00:00.000Z' },
      { op: 'lte', column: 'occurred_at', value: '2026-03-31T15:59:59.999Z' },
    ]);
  });

  it('compares occurred_at directly, so undated rows drop out', () => {
    // This is the fix for undated rows matching *every* range: a SQL
    // comparison against NULL is false, where the old `if (from && tx.date)`
    // guard skipped the check entirely and let the row through.
    const ops = buildTransactionOps(f({ dateFrom: '2026-03-01' }), '');
    expect(ops.every((o) => 'column' in o && o.column === 'occurred_at')).toBe(true);
  });
});

describe('categories', () => {
  it('uses `in` for plain ids', () => {
    expect(buildTransactionOps(f({ categoryIds: ['a', 'b'] }), '')).toEqual([
      { op: 'in', column: 'category_id', values: ['a', 'b'] },
    ]);
  });

  it('uses `is null` when only Uncategorised is selected', () => {
    expect(buildTransactionOps(f({ categoryIds: [null] }), '')).toEqual([
      { op: 'isNull', column: 'category_id' },
    ]);
  });

  it('ors the two together when Uncategorised is mixed with ids', () => {
    // `in` cannot express NULL — NULL is not equal to anything, itself
    // included — so mixing the two has to become an explicit or.
    expect(buildTransactionOps(f({ categoryIds: [null, 'a'] }), '')).toEqual([
      { op: 'or', expr: 'category_id.is.null,category_id.in.(a)' },
    ]);
  });
});

describe('text matching', () => {
  it('searches merchant, raw text and notes', () => {
    const ops = buildTransactionOps(f(), 'hua ho');
    expect(ops).toEqual([
      {
        op: 'or',
        expr:
          'merchant_normalized.ilike."%hua ho%",raw_text.ilike."%hua ho%",notes.ilike."%hua ho%"',
      },
    ]);
  });

  it('quotes values so a comma cannot truncate the expression', () => {
    // PostgREST splits `or=(…)` on commas. An unquoted merchant containing one
    // would silently turn into a different query.
    const [op] = buildTransactionOps(f({ recipient: 'SYARIKAT ABC, BHD' }), '');
    expect(op).toEqual({
      op: 'or',
      expr:
        'merchant_normalized.ilike."%SYARIKAT ABC, BHD%",merchant.ilike."%SYARIKAT ABC, BHD%"',
    });
  });

  // Two layers of escaping stack here, and it is easy to count one of them
  // twice. LIKE sees the value after PostgREST has unquoted it, so a literal
  // `%` needs a `\` for LIKE, and that `\` in turn needs `\\` inside the
  // quotes. The wire form below decodes to LIKE pattern `%100\%%`.
  it('escapes LIKE wildcards typed by the user', () => {
    const [op] = buildTransactionOps(f({ recipient: '100%' }), '');
    expect(op).toMatchObject({ expr: expect.stringContaining('"%100\\\\%%"') });
  });

  it('escapes embedded quotes and backslashes', () => {
    const [op] = buildTransactionOps(f({ recipient: 'a"b\\c' }), '');
    expect(op).toMatchObject({ expr: expect.stringContaining('a\\"b\\\\\\\\c') });
  });

  it('ignores whitespace-only input', () => {
    expect(buildTransactionOps(f({ recipient: '   ' }), '   ')).toEqual([]);
  });
});

describe('hasAnyFilter', () => {
  it('is false for the defaults', () => {
    expect(hasAnyFilter(DEFAULT_FILTERS)).toBe(false);
  });

  it('does not count a whitespace-only recipient', () => {
    expect(hasAnyFilter(f({ recipient: '  ' }))).toBe(false);
  });

  it('notices each filter', () => {
    expect(hasAnyFilter(f({ currencies: ['SGD'] }))).toBe(true);
    expect(hasAnyFilter(f({ cards: ['0213'] }))).toBe(true);
    expect(hasAnyFilter(f({ banks: ['baiduri'] }))).toBe(true);
    expect(hasAnyFilter(f({ categoryIds: [null] }))).toBe(true);
    expect(hasAnyFilter(f({ dateTo: '2026-01-01' }))).toBe(true);
  });
});

describe('combining', () => {
  it('ands every active filter together', () => {
    const ops = buildTransactionOps(
      f({ banks: ['baiduri'], currencies: ['BND'], cards: ['0213'], dateFrom: '2026-03-01' }),
      'ho',
    );
    expect(ops.map((o) => o.op)).toEqual(['in', 'in', 'in', 'gte', 'or']);
  });
});

describe('recent window (list default)', () => {
  it('starts 29 days before today, Brunei time', () => {
    expect(recentWindowStartKey()).toBe(bruneiDayKey(Date.now() - 29 * 86_400_000));
  });

  it('defaultListFilters sets only the window', () => {
    expect(defaultListFilters()).toEqual({ ...DEFAULT_FILTERS, dateFrom: recentWindowStartKey() });
  });

  it('isRecentWindow is true only for the untouched default', () => {
    expect(isRecentWindow(defaultListFilters())).toBe(true);
    expect(isRecentWindow(DEFAULT_FILTERS)).toBe(false);
    expect(isRecentWindow({ ...defaultListFilters(), dateTo: recentWindowStartKey() })).toBe(false);
    expect(isRecentWindow({ ...defaultListFilters(), dateFrom: '2000-01-01' })).toBe(false);
  });
});
