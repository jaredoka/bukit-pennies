import { describe, expect, it } from 'vitest';
import {
  UNDATED_SORTED,
  txCursorFilter,
  txCursorFilterLegacy,
  txCursorOf,
} from '@/lib/txCursor';

/**
 * The list's ordering is `occurred_sorted desc, created_at desc, id desc`,
 * where `occurred_sorted` is `coalesce(occurred_at, sentinel)` (migration 28).
 * These pin the "rows after this one" predicate for every cursor shape, and the
 * legacy variant that runs on a host without the generated column.
 */

const CREATED = '2026-10-01T04:00:00.000Z';
const ID = '0b6f6f4e-3a5d-4c6e-9f0a-1d2c3b4a5e6f';

describe('txCursorFilter', () => {
  it('takes older rows, the rest of the same sort value, then the id tiebreak', () => {
    const sorted = '2026-09-30T04:00:00.000Z';
    expect(
      txCursorFilter({ occurredAt: sorted, occurredSorted: sorted, createdAt: CREATED, id: ID }),
    ).toBe(
      [
        `occurred_sorted.lt.${sorted}`,
        `and(occurred_sorted.eq.${sorted},created_at.lt.${CREATED})`,
        `and(occurred_sorted.eq.${sorted},created_at.eq.${CREATED},id.lt.${ID})`,
      ].join(','),
    );
  });

  it('never emits a NULL test, so the range has no nullable comparison', () => {
    const filter = txCursorFilter({
      occurredAt: '2026-09-30T04:00:00.000Z',
      occurredSorted: '2026-09-30T04:00:00.000Z',
      createdAt: CREATED,
      id: ID,
    });
    expect(filter).not.toContain('is.null');
  });

  it('walks the undated tail by created_at and id using the sentinel value', () => {
    const filter = txCursorFilter({
      occurredAt: null,
      occurredSorted: UNDATED_SORTED,
      createdAt: CREATED,
      id: ID,
    });
    // The sentinel is a real value, so the same three branches apply — no
    // special "inside the NULL group" case is needed any more.
    expect(filter).toBe(
      [
        `occurred_sorted.lt.${UNDATED_SORTED}`,
        `and(occurred_sorted.eq.${UNDATED_SORTED},created_at.lt.${CREATED})`,
        `and(occurred_sorted.eq.${UNDATED_SORTED},created_at.eq.${CREATED},id.lt.${ID})`,
      ].join(','),
    );
  });
});

describe('txCursorFilterLegacy', () => {
  it('walks the NULL occurred_at tail by created_at and id', () => {
    expect(
      txCursorFilterLegacy({
        occurredAt: null,
        occurredSorted: UNDATED_SORTED,
        createdAt: CREATED,
        id: ID,
      }),
    ).toBe(
      [
        `and(occurred_at.is.null,created_at.lt.${CREATED})`,
        `and(occurred_at.is.null,created_at.eq.${CREATED},id.lt.${ID})`,
      ].join(','),
    );
  });

  it('takes the older dated rows, the rest of the same timestamp, then the NULL tail', () => {
    const occurred = '2026-09-30T04:00:00.000Z';
    const filter = txCursorFilterLegacy({
      occurredAt: occurred,
      occurredSorted: occurred,
      createdAt: CREATED,
      id: ID,
    });

    expect(filter.split('occurred_at.lt.')).toHaveLength(2);
    expect(filter).toContain(`and(occurred_at.eq.${occurred},created_at.lt.${CREATED})`);
    expect(filter).toContain(
      `and(occurred_at.eq.${occurred},created_at.eq.${CREATED},id.lt.${ID})`,
    );
    expect(filter.endsWith('occurred_at.is.null')).toBe(true);
  });

  it('always uses the id tiebreaker for rows that share both timestamps', () => {
    const filter = txCursorFilterLegacy({
      occurredAt: '2026-09-30T04:00:00.000Z',
      occurredSorted: '2026-09-30T04:00:00.000Z',
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
      occurredSorted: '2026-10-27T05:00:00.000Z',
      createdAt: '2026-10-27T06:00:00.000Z',
      id: ID,
    });
  });

  it('derives the sentinel for a missing occurred_at instead of inventing a date', () => {
    expect(txCursorOf({ occurred_at: null, created_at: CREATED, id: ID })).toEqual({
      occurredAt: null,
      occurredSorted: UNDATED_SORTED,
      createdAt: CREATED,
      id: ID,
    });
  });
});
