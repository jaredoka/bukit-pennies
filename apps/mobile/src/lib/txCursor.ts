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
 */

export interface TxCursor {
  /** Normalised to UTC so the timestamp can go into a filter unescaped. */
  occurredAt: string | null;
  createdAt: string;
  id: string;
}

/** The cursor pointing at this row. */
export function txCursorOf(row: {
  occurred_at: string | null;
  created_at: string;
  id: string;
}): TxCursor {
  return {
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    id: row.id,
  };
}

/**
 * The PostgREST `or` expression selecting the rows strictly after `cursor`, in
 * the same order the list displays: newest `occurred_at` first, NULLs last,
 * then `created_at`, then `id`.
 */
export function txCursorFilter(cursor: TxCursor): string {
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
