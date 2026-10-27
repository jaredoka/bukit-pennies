import { describe, expect, it } from 'vitest';
import { txCursorFilter, txCursorOf } from '@/lib/txCursor';

/**
 * The list's ordering is `occurred_at desc nulls last, created_at desc,
 * id desc`. These pin the "rows after this one" predicate for each shape the
 * cursor can take, including the NULL tail where a missing `occurred_at` would
 * otherwise let a page escape the group.
 */

const CREATED = '2026-10-01T04:00:00.000Z';
const ID = '0b6f6f4e-3a5d-4c6e-9f0a-1d2c3b4a5e6f';

describe('txCursorFilter', () => {
  it('walks the NULL occurred_at tail by created_at and id', () => {
    expect(txCursorFilter({ occurredAt: null, createdAt: CREATED, id: ID })).toBe(
      [
        `and(occurred_at.is.null,created_at.lt.${CREATED})`,
        `and(occurred_at.is.null,created_at.eq.${CREATED},id.lt.${ID})`,
      ].join(','),
    );
  });

  it('takes the older dated rows, the rest of the same timestamp, then the NULL tail', () => {
    const occurred = '2026-09-30T04:00:00.000Z';
    const filter = txCursorFilter({ occurredAt: occurred, createdAt: CREATED, id: ID });

    expect(filter.split('occurred_at.lt.')).toHaveLength(2);
    expect(filter).toContain(`and(occurred_at.eq.${occurred},created_at.lt.${CREATED})`);
    expect(filter).toContain(
      `and(occurred_at.eq.${occurred},created_at.eq.${CREATED},id.lt.${ID})`,
    );
    expect(filter.endsWith('occurred_at.is.null')).toBe(true);
  });

  it('always uses the id tiebreaker for rows that share both timestamps', () => {
    const filter = txCursorFilter({
      occurredAt: '2026-09-30T04:00:00.000Z',
      createdAt: CREATED,
      id: ID,
    });
    expect(filter).toContain(`id.lt.${ID}`);
  });
});

describe('txCursorOf', () => {
  it('normalises offsets to UTC so the filter value needs no escaping', () => {
    expect(
      txCursorOf({
        occurred_at: '2026-10-27T13:00:00+08:00',
        created_at: '2026-10-27T14:00:00+08:00',
        id: ID,
      }),
    ).toEqual({
      occurredAt: '2026-10-27T05:00:00.000Z',
      createdAt: '2026-10-27T06:00:00.000Z',
      id: ID,
    });
  });

  it('keeps a missing occurred_at as NULL rather than inventing a date', () => {
    expect(txCursorOf({ occurred_at: null, created_at: CREATED, id: ID })).toEqual({
      occurredAt: null,
      createdAt: CREATED,
      id: ID,
    });
  });
});
