/**
 * Cursor pagination for the transactions list.
 *
 * The list used to page with `range(offset, offset + 49)`. That has two costs:
 * Postgres walks and discards `offset` rows on every page, and rows inserted or
 * edited between requests shift the window, so a page can repeat one row and
 * skip another. The list orders by `(occurred_at desc nulls last, created_at
 * desc, id desc)`; `id` is what makes that a total order, because a bulk import
 * gives many rows the same timestamp and without it two pages can disagree.
 *
 * Keyset pagination asks for "the rows after this exact row" instead, so every
 * page costs the same and nothing moves underneath the reader.
 *
 * The predicate uses PostgREST's logical-tree syntax. `occurred_at` is
 * nullable and NULLs sort last, so a cursor that points into the NULL group
 * continues through that group only.
 *
 * ## Why `occurredSorted` exists
 *
 * That OR tree is logically correct but not an index *range*: Postgres can only
 * use it as a filter on an ordered scan from the head of the index, so page N
 * still walks N pages' worth of rows (`Rows Removed by Filter` in the plan).
 * Migration 28 adds a stored `occurred_sorted` column —
 * `coalesce(occurred_at, '0001-01-01T00:00:00Z')` — so the client can also send
 * `occurred_sorted <= cursor` as a plain `lte` filter. That single comparison
 * becomes the `Index Cond`; the OR tree stays as the strict tie-break for the
 * boundary row. The sentinel replaces NULL, so undated rows keep sorting last
 * and the special "inside the NULL group" branch disappears.
 *
 * `txCursorFilterLegacy` is the pre-28 predicate, kept for hosts that have not
 * run the migration yet (see `supportsSortKey` in `queries.ts`).
 */

/** Sort value for a row with no `occurred_at`; matches the generated column. */
export const UNDATED_SORTED = '0001-01-01T00:00:00.000Z';

export interface TxCursor {
  /** Normalised to UTC so the timestamp can go into a filter unescaped. */
  occurredAt: string | null;
  /** `occurredAt`, or the sentinel for undated rows; equals the generated column. */
  occurredSorted: string;
  createdAt: string;
  id: string;
}

/** The cursor pointing at this row. */
export function txCursorOf(row: {
  occurred_at: string | null;
  created_at: string;
  id: string;
}): TxCursor {
  const occurredAt = row.occurred_at
    ? new Date(row.occurred_at).toISOString()
    : null;
  return {
    occurredAt,
    // Derived rather than read off the row: the cursor must work even when the
    // payload predates migration 28, and the generated column has exactly this
    // value by definition.
    occurredSorted: occurredAt ?? UNDATED_SORTED,
    createdAt: new Date(row.created_at).toISOString(),
    id: row.id,
  };
}

/**
 * The PostgREST `or` expression selecting the rows strictly after `cursor` in
 * `(occurred_sorted, created_at, id)` order.
 *
 * Callers must also send `occurred_sorted <= cursor.occurredSorted`; this
 * expression is the strict half, and that comparison is what lets the planner
 * start the scan at the cursor instead of the head of the index.
 */
export function txCursorFilter(cursor: TxCursor): string {
  const { occurredSorted, createdAt, id } = cursor;

  return [
    `occurred_sorted.lt.${occurredSorted}`,
    `and(occurred_sorted.eq.${occurredSorted},created_at.lt.${createdAt})`,
    `and(occurred_sorted.eq.${occurredSorted},created_at.eq.${createdAt},id.lt.${id})`,
  ].join(',');
}

/**
 * The pre-migration-28 predicate, over `occurred_at` itself.
 *
 * Identical in meaning to `txCursorFilter` — the generated column is
 * `coalesce(occurred_at, sentinel)` — but it has to special-case the NULL tail,
 * because `occurred_at` is genuinely NULL there and NULL comparisons are never
 * true.
 */
export function txCursorFilterLegacy(cursor: TxCursor): string {
  const { occurredAt, createdAt, id } = cursor;

  if (occurredAt === null) {
    // Already in the NULL tail: continue by created_at and id only.
    return [
      `and(occurred_at.is.null,created_at.lt.${createdAt})`,
      `and(occurred_at.is.null,created_at.eq.${createdAt},id.lt.${id})`,
    ].join(',');
  }

  return [
    `occurred_at.lt.${occurredAt}`,
    `and(occurred_at.eq.${occurredAt},created_at.lt.${createdAt})`,
    `and(occurred_at.eq.${occurredAt},created_at.eq.${createdAt},id.lt.${id})`,
    'occurred_at.is.null',
  ].join(',');
}
