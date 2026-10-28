-- 28_keyset_sort_key.sql — make deep list pages constant-time.
--
-- Pagination is already keyset (`txCursor`: "the rows after this exact row"),
-- which fixed the skip/duplicate bug when a capture lands mid-scroll. But the
-- predicate it sends is a logical OR:
--
--   occurred_at < X
--   OR (occurred_at = X AND created_at < Y)
--   OR (occurred_at = X AND created_at = Y AND id < Z)
--
-- Postgres cannot turn that into an index *range*, so it becomes a `Filter`
-- over an ordered scan from the head of the index:
--
--   Index Scan using transactions_user_list_idx
--     Index Cond: (user_id = ...)
--     Filter: (...)
--     Rows Removed by Filter: 4123        -- page 61, 9k rows, 2.27 ms
--
-- The page is still correct, and it no longer materialises the discarded rows
-- as a result set, but it is O(depth) — the same shape as the OFFSET it
-- replaced. Extrapolated: ~25 ms at 100k rows, ~100 ms at 500k.
--
-- The fix is a stored sort key so the client can send a plain range:
--
--   occurred_sorted <= cursor        -- becomes an Index Cond
--   AND (the tie-break OR)           -- refines only the boundary row
--
-- `occurred_at` is nullable and sorts last, which is why the ordering carries
-- `nulls last`. A generated column cannot be NULL, so the sentinel replaces the
-- NULL: '0001-01-01T00:00:00Z' is older than any real transaction and keeps
-- undated rows at the tail of a descending scan. That also removes the special
-- "we are inside the NULL group" branch from the predicate — the sentinel group
-- is just another value group.
--
-- Measured on the 9,000-row/3-year benchmark (see HANDOFF §47.9): the row
-- comparison form of this predicate costs 0.19 ms and 6 buffers, against
-- 2.27 ms and 188 buffers for the OR-only form at the same depth.
--
-- Operational notes:
--
--   * `ADD COLUMN ... GENERATED ... STORED` rewrites the table and holds an
--     access-exclusive lock while it does. Fine at this size (seconds), not
--     something to repeat casually on a large table.
--   * The index is built non-concurrently because the Supabase SQL editor runs
--     a script and `CONCURRENTLY` cannot run inside a transaction block.
--   * The old list index is replaced, not kept: the new one covers the same
--     `user_id` prefix and the same total order. Queries that range on
--     `occurred_at` itself (the capped "recent" / "since" row reads) lose that
--     index and fall back to a sequential or other-index plan, which is cheap
--     at these sizes and is the deliberate trade for not carrying two
--     overlapping indexes on the hottest write path. The dashboard does not
--     depend on either: it reads the summary tables (migration 27).

-- ── 1. The sort key ──────────────────────────────────────────────────────────
alter table public.transactions
  add column if not exists occurred_sorted timestamptz
    generated always as (
      coalesce(occurred_at, '0001-01-01T00:00:00Z'::timestamptz)
    ) stored;

comment on column public.transactions.occurred_sorted is
  'Sort/pagination key: coalesce(occurred_at, 0001-01-01). Exists so the '
  'keyset predicate can be a btree range instead of a filter; equals '
  'occurred_at for every dated row.';

-- ── 2. The index the range needs ─────────────────────────────────────────────
-- Same total order as the list displays, so an ordered scan needs no sort.
drop index if exists public.transactions_user_list_idx;

create index transactions_user_list_idx
  on public.transactions (user_id, occurred_sorted desc, created_at desc, id desc);

-- Fresh statistics for the rewritten table, so the planner prices the range
-- correctly on the first request rather than after autoanalyze.
analyze public.transactions;
