import { normalizeMerchant } from '@bukit/parsers';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { bruneiMonthStartIso, bruneiParts } from './format';
import { describeRequestError } from './netError';
import { supabase } from './supabase';
import { buildTransactionOps, type TxFilters } from './txFilters';
import type {
  BudgetRow,
  CategoryRow,
  IngestDeviceRow,
  MonthlyTotalRow,
  ProfileRow,
  SavingsGoalEntryRow,
  SavingsGoalRow,
  SavingsGoalWithProgress,
  SubscriptionRow,
  TransactionFacetRow,
  TransactionRow,
} from './types';

/** SGD circulates 1:1 with BND in Brunei (Currency Interchangeability
 *  Agreement) — SGD amounts count toward BND totals at par. */
export const PAR_CURRENCIES = ['BND', 'SGD', 'USD', 'MYR', 'GBP', 'EUR', 'AUD'];

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  // A transport failure can arrive either way: supabase-js folds most fetch
  // errors into `error`, but a rejection still escapes on some platforms.
  let result: { data: T | null; error: { message: string } | null };
  try {
    result = await promise;
  } catch (e) {
    throw new Error(describeRequestError(e instanceof Error ? e.message : String(e)));
  }
  if (result.error) throw new Error(describeRequestError(result.error.message));
  return result.data as T;
}

/**
 * The most rows PostgREST will return in one response — `max_rows` in
 * `supabase/config.toml`, and the same figure by default on the hosted
 * project. **Lowering `max_rows` without changing this constant reintroduces
 * the bug below**, so the two move together.
 *
 * It is a cap, not an error: a query for a year of transactions came back with
 * the first thousand and no indication that there were more. The dashboard's
 * "All year" donut, every Insights total and the recurring-spend detector all
 * read whole periods that way, so past about a thousand transactions in the
 * window they quietly understated. `exportCsv` had always paged; the query
 * layer had not.
 */
const MAX_ROWS_PER_REQUEST = 1000;

/**
 * Reads every row of a query, a page at a time.
 *
 * `page` must impose a **total** order — a column with ties is not enough,
 * because `range()` slices the ordered result and rows that tie can swap
 * between two requests, which loses one and repeats another. Every caller here
 * ends its ordering with `id`.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += MAX_ROWS_PER_REQUEST) {
    const batch = await unwrap<T[]>(page(from, from + MAX_ROWS_PER_REQUEST - 1));
    rows.push(...batch);
    if (batch.length < MAX_ROWS_PER_REQUEST) return rows;
  }
}

// ------------------------------------------------------------------ queries

export const TX_PAGE_SIZE = 50;

/** The projection every whole-period aggregate reads: enough to bucket by day,
 *  month, category and merchant, and nothing else — these queries can pull
 *  thousands of rows, so `select *` would move a lot of `raw_text` for nothing. */
const TX_AGGREGATE_COLUMNS = 'occurred_at, amount, currency, category_id, merchant_normalized';
type TxAggregateRow = Pick<
  TransactionRow,
  'occurred_at' | 'amount' | 'currency' | 'category_id' | 'merchant_normalized'
>;

/**
 * Everything derived from the transactions table. One helper because the list
 * of derived caches keeps growing — `transaction_facets` is the fourth — and
 * six call sites each repeating the set is how one of them gets missed.
 */
export function invalidateTransactionQueries(qc: QueryClient): void {
  for (const key of ['transactions', 'monthly_totals', 'transaction_facets']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Distinct bank / card / currency combinations for this user, for the filter
 * pickers. A separate query because the list is paged now: the options cannot
 * be derived from the rows currently loaded without a bank the user last spent
 * at 600 transactions ago quietly disappearing from the Bank sheet.
 */
export function useTransactionFacets() {
  return useQuery({
    queryKey: ['transaction_facets'],
    queryFn: () =>
      unwrap<TransactionFacetRow[]>(supabase.from('transaction_facets').select('*')),
  });
}

/**
 * The transactions list: filtered and ordered by the database, one page at a
 * time. Replaces a flat `limit(500)` that the client then filtered — which
 * quietly answered "matches, among the newest 500" (see txFilters.ts).
 *
 * The key stays under `['transactions', …]` so the existing
 * `invalidateQueries({ queryKey: ['transactions'] })` calls after an ingest or
 * an edit still match it by prefix.
 */
export function useFilteredTransactions(filters: TxFilters, search: string) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'list', filters, search],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      let q = supabase.from('transactions').select('*');
      for (const op of buildTransactionOps(filters, search)) {
        if (op.op === 'in') q = q.in(op.column, op.values);
        else if (op.op === 'or') q = q.or(op.expr);
        else if (op.op === 'isNull') q = q.is(op.column, null);
        else q = q[op.op](op.column, op.value);
      }
      return unwrap<TransactionRow[]>(
        q
          .order('occurred_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(pageParam, pageParam + TX_PAGE_SIZE - 1),
      );
    },
    // A short page means the end; no count(*) on every scroll to learn it.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < TX_PAGE_SIZE ? undefined : allPages.length * TX_PAGE_SIZE,
    // Changing a filter changes the query key, which would otherwise empty the
    // list and throw the whole screen — filter bar included — behind a spinner
    // on every tap. Hold the previous rows until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transactions', id],
    enabled: !!id,
    queryFn: () =>
      unwrap<TransactionRow>(supabase.from('transactions').select('*').eq('id', id!).single()),
  });
}

/** The `or` that defines the review inbox: anything the parser was unsure of,
 *  plus anything flagged as a possible second capture of the same spend. */
const REVIEW_PREDICATE = 'parse_status.eq.needs_review,possible_duplicate_of.not.is.null';

/**
 * needs_review rows plus flagged near-duplicates, oldest first.
 *
 * Capped, and deliberately not paged like the aggregates: this is a queue to
 * be worked down, not a total to be correct. Oldest-first plus a cap is
 * self-refilling — clear some and the next ones move into the window — where
 * rendering ten thousand editable cards into a FlatList is just a stall.
 */
const REVIEW_LIMIT = 200;

export function useReviewItems() {
  return useQuery({
    queryKey: ['transactions', 'review'],
    queryFn: () =>
      unwrap<TransactionRow[]>(
        supabase
          .from('transactions')
          .select('*')
          .or(REVIEW_PREDICATE)
          .order('created_at', { ascending: true })
          .limit(REVIEW_LIMIT),
      ),
  });
}

/**
 * How many rows are waiting in the review inbox.
 *
 * `head: true` with an exact count asks Postgres for the number and transfers
 * no rows, which is what makes it cheap enough to sit on the dashboard and the
 * transactions header — the two places that are now the only way in. The inbox
 * had no entry point at all for several releases: the tab was hidden and
 * nothing linked to it, so every low-confidence parse and every flagged
 * duplicate accumulated somewhere no user could reach.
 *
 * Keyed under `transactions` so the existing invalidation catches it.
 */
export function useReviewCount() {
  return useQuery({
    queryKey: ['transactions', 'review-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .or(REVIEW_PREDICATE);
      if (error) throw new Error(describeRequestError(error.message));
      return count ?? 0;
    },
  });
}

export function useMonthlyTotals() {
  return useQuery({
    queryKey: ['monthly_totals'],
    queryFn: () =>
      unwrap<MonthlyTotalRow[]>(
        supabase.from('monthly_totals').select('*').order('month', { ascending: false }),
      ),
  });
}

/** Parsed transactions of the current Brunei month — daily-spend chart,
 *  category donut, and this-month stat tiles. */
export function useThisMonthTransactions() {
  const since = bruneiMonthStartIso(0);
  return useQuery({
    queryKey: ['transactions', 'month', since],
    queryFn: () =>
      fetchAllPages<TxAggregateRow>((from, to) =>
        supabase
          .from('transactions')
          .select(TX_AGGREGATE_COLUMNS)
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .in('currency', PAR_CURRENCIES)
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  });
}

/** Transactions for a specific Brunei year (month=null) or month (1-indexed). */
export function useTransactionsForPeriod(year: number, month: number | null) {
  const BNT = 8 * 60 * 60 * 1000;
  const start = month !== null
    ? new Date(Date.UTC(year, month - 1, 1) - BNT).toISOString()
    : new Date(Date.UTC(year, 0, 1) - BNT).toISOString();
  const end = month !== null
    ? new Date(Date.UTC(year, month, 1) - BNT).toISOString()
    : new Date(Date.UTC(year + 1, 0, 1) - BNT).toISOString();
  return useQuery({
    queryKey: ['transactions', 'period', year, month],
    queryFn: () =>
      fetchAllPages<TxAggregateRow>((from, to) =>
        supabase
          .from('transactions')
          .select(TX_AGGREGATE_COLUMNS)
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .in('currency', PAR_CURRENCIES)
          .gte('occurred_at', start)
          .lt('occurred_at', end)
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  });
}

/** Brunei year of the oldest transaction, or null when there are none. Bounds
 *  the Insights year picker so it offers only years the account could have
 *  data for. One row, so it stays cheap as history grows. */
export function useEarliestTransactionYear() {
  return useQuery({
    queryKey: ['transactions', 'earliest-year'],
    queryFn: async () => {
      const rows = await unwrap<{ occurred_at: string | null }[]>(
        supabase
          .from('transactions')
          .select('occurred_at')
          .eq('parse_status', 'parsed')
          .not('occurred_at', 'is', null)
          .order('occurred_at', { ascending: true })
          .limit(1),
      );
      const iso = rows?.[0]?.occurred_at;
      return iso ? bruneiParts(iso).year : null;
    },
  });
}

/** Parsed spends of the last `monthsBack` Brunei months — recurring detection
 *  and the insights screen. */
export function useRecentMonthsTransactions(monthsBack = 6) {
  const since = bruneiMonthStartIso(monthsBack - 1);
  return useQuery({
    queryKey: ['transactions', 'recent-months', since],
    queryFn: () =>
      fetchAllPages<TxAggregateRow>((from, to) =>
        supabase
          .from('transactions')
          .select(TX_AGGREGATE_COLUMNS)
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .not('occurred_at', 'is', null)
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => unwrap<BudgetRow[]>(supabase.from('budgets').select('*')),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () =>
      unwrap<CategoryRow[]>(supabase.from('categories').select('*').order('name')),
  });
}

export function useDevices(opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['ingest_devices'],
    queryFn: () =>
      unwrap<IngestDeviceRow[]>(
        supabase.from('ingest_devices').select('*').order('created_at', { ascending: false }),
      ),
    refetchInterval: opts?.refetchInterval,
  });
}

/** Invalidates everything that reads a goal's progress. Both keys move
 *  together — `saved` lives in the view, so an entry change alters the goals
 *  list without touching a savings_goals row. */
function invalidateGoalQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['savings_goals'] });
  qc.invalidateQueries({ queryKey: ['savings_goal_entries'] });
}

/**
 * Goals with their derived progress. Two reads rather than a PostgREST
 * embed: `savings_goal_progress` is a view keyed on goal_id with no foreign
 * key for PostgREST to follow, so it cannot be embedded. Both are tiny and
 * owner-scoped, and joining them here keeps the view free of the goal columns
 * it would otherwise have to duplicate.
 */
export function useSavingsGoals() {
  return useQuery({
    queryKey: ['savings_goals'],
    queryFn: async (): Promise<SavingsGoalWithProgress[]> => {
      const [goals, progress] = await Promise.all([
        unwrap<SavingsGoalRow[]>(
          supabase.from('savings_goals').select('*').order('created_at', { ascending: true }),
        ),
        unwrap<{ goal_id: string; saved: number | string; entry_count: number; last_entry_on: string | null }[]>(
          supabase.from('savings_goal_progress').select('goal_id, saved, entry_count, last_entry_on'),
        ),
      ]);
      const byGoal = new Map(progress.map((p) => [p.goal_id, p]));
      return goals.map((g) => {
        const p = byGoal.get(g.id);
        return {
          ...g,
          saved: Number(p?.saved ?? 0),
          entry_count: Number(p?.entry_count ?? 0),
          last_entry_on: p?.last_entry_on ?? null,
        };
      });
    },
  });
}

/** One goal's ledger, newest first. */
export function useSavingsGoalEntries(goalId: string | undefined) {
  return useQuery({
    queryKey: ['savings_goal_entries', goalId],
    enabled: !!goalId,
    queryFn: () =>
      unwrap<SavingsGoalEntryRow[]>(
        supabase
          .from('savings_goal_entries')
          .select('*')
          .eq('goal_id', goalId!)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ),
  });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, target, currency }: { name: string; target: number; currency: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap<SavingsGoalRow>(
        supabase
          .from('savings_goals')
          .insert({ user_id: userId, name, target_amount: target, currency })
          .select()
          .single(),
      );
    },
    onSettled: () => invalidateGoalQueries(qc),
  });
}

/** Renames a goal or changes its target. Currency is deliberately absent —
 *  it is fixed at creation (HANDOFF §17). */
export function useUpdateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; target_amount?: number } }) =>
      unwrap<SavingsGoalRow>(
        supabase.from('savings_goals').update(patch).eq('id', id).select().single(),
      ),
    onSettled: () => invalidateGoalQueries(qc),
  });
}

/**
 * Adds a ledger entry. A plain insert, not a read-modify-write of a running
 * total: two devices adding at the same moment used to lose one of the two,
 * because each read the same starting figure. `user_id` defaults to
 * `auth.uid()` server-side so the client never states it.
 *
 * A negative amount is a withdrawal.
 */
export function useAddSavingsGoalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      goalId,
      amount,
      occurredOn,
      note,
    }: {
      goalId: string;
      amount: number;
      occurredOn?: string;
      note?: string | null;
    }) =>
      unwrap<SavingsGoalEntryRow>(
        supabase
          .from('savings_goal_entries')
          .insert({
            goal_id: goalId,
            amount,
            ...(occurredOn ? { occurred_on: occurredOn } : {}),
            note: note?.trim() || null,
          })
          .select()
          .single(),
      ),
    onSettled: () => invalidateGoalQueries(qc),
  });
}

/**
 * Corrects an entry in place. `amount` carries its own direction: pass a
 * negative to make it a withdrawal, positive to make it a deposit, so a row
 * logged the wrong way round is fixed by editing rather than by deleting and
 * re-logging.
 *
 * The database refuses zero (`amount <> 0`, migration 19), so callers must not
 * offer it.
 */
export function useUpdateSavingsGoalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { amount?: number; occurred_on?: string; note?: string | null };
    }) =>
      unwrap<SavingsGoalEntryRow>(
        supabase.from('savings_goal_entries').update(patch).eq('id', id).select().single(),
      ),
    onSettled: () => invalidateGoalQueries(qc),
  });
}

/** Deleting the offending entry is how a mistake is corrected — the total is
 *  a sum, so removing the row restores the right figure exactly. */
export function useDeleteSavingsGoalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(supabase.from('savings_goal_entries').delete().eq('id', id)),
    onSettled: () => invalidateGoalQueries(qc),
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(supabase.from('savings_goals').delete().eq('id', id)),
    onSettled: () => invalidateGoalQueries(qc),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: () =>
      unwrap<SubscriptionRow[]>(
        supabase.from('subscriptions').select('*').order('created_at', { ascending: true }),
      ),
  });
}

/** Everything the subscription form can write. `id` present = edit. */
export type SubscriptionInput = Pick<
  SubscriptionRow,
  | 'name'
  | 'amount'
  | 'currency'
  | 'cycle'
  | 'cycle_days'
  | 'next_due_on'
  | 'category_id'
  | 'card_last4'
  | 'merchant_normalized'
  | 'trial_ends_on'
  | 'started_on'
  | 'notes'
  | 'status'
> & { id?: string };

export function useSaveSubscription() {
  const qc = useQueryClient();
  return useMutation({
    // `user_id` is left to the column default (auth.uid()) rather than sent from
    // here — the client never gets to claim which account a row belongs to.
    mutationFn: async ({ id, ...fields }: SubscriptionInput) =>
      unwrap<SubscriptionRow>(
        id
          ? supabase.from('subscriptions').update(fields).eq('id', id).select().single()
          : supabase.from('subscriptions').insert(fields).select().single(),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(supabase.from('subscriptions').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => unwrap<ProfileRow>(supabase.from('profiles').select('*').single()),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<ProfileRow, 'display_name' | 'monthly_income'>>) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap<ProfileRow>(
        supabase.from('profiles').update(patch).eq('id', userId).select().single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

/** Pull-to-refresh helper: refetches every active query on the screen. */
export function usePullToRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ type: 'active' }),
        new Promise((r) => setTimeout(r, 600)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);
  return { refreshing, onRefresh };
}

// ---------------------------------------------------------------- mutations

function useInvalidateTx() {
  const qc = useQueryClient();
  return () => {
    invalidateTransactionQueries(qc);
  };
}

/** The columns a transaction edit may touch — mirrors the server-side
 *  allowlist in `update_transaction` (migration 23), which is the real gate.
 *  Everything the parser owns (raw_text, raw_hash, source, id, user_id, …) is
 *  deliberately absent. */
const TRANSACTION_EDIT_COLUMNS = [
  'merchant',
  'merchant_normalized',
  'category_id',
  'amount',
  'currency',
  'occurred_at',
  'card_last4',
  'notes',
  'bank',
  'parse_status',
  'confidence',
  'possible_duplicate_of',
] as const;
export type TransactionPatch = Partial<Pick<TransactionRow, (typeof TRANSACTION_EDIT_COLUMNS)[number]>>;

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTx();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TransactionPatch }) =>
      unwrap<TransactionRow>(
        supabase.rpc('update_transaction', {
          p_id: id,
          p_patch: Object.fromEntries(
            Object.entries(patch).filter(([k]) =>
              (TRANSACTION_EDIT_COLUMNS as readonly string[]).includes(k),
            ),
          ),
        }),
      ),
    // Optimistic notes/category edits per HANDOFF §8.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['transactions', id] });
      const previous = qc.getQueryData<TransactionRow>(['transactions', id]);
      if (previous) qc.setQueryData(['transactions', id], { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) qc.setQueryData(['transactions', id], ctx.previous);
    },
    onSettled: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTx();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(supabase.from('transactions').delete().eq('id', id)),
    onSettled: invalidate,
  });
}

export interface ManualTxInput {
  merchant: string;
  amount: number;
  currency: string;
  occurredAt: string; // ISO with +08:00 offset
  categoryId: string | null;
  cardLast4: string | null;
  notes: string | null;
}

export function useCreateManualTransaction() {
  const invalidate = useInvalidateTx();
  return useMutation({
    mutationFn: async (input: ManualTxInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      // raw_text documents the entry (shown as "Original message"); raw_hash
      // gets a per-entry unique suffix so two identical manual entries never
      // trip the exact-dupe guard, which exists for captured messages.
      const rawText = `Manual entry: ${input.currency} ${input.amount.toFixed(2)} at ${input.merchant} on ${input.occurredAt}`;
      const rawHash = `manual:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
      return unwrap<TransactionRow>(
        supabase
          .from('transactions')
          .insert({
            user_id: userId,
            occurred_at: input.occurredAt,
            amount: input.amount,
            currency: input.currency,
            merchant: input.merchant,
            merchant_normalized: normalizeMerchant(input.merchant),
            bank: 'unknown',
            card_last4: input.cardLast4,
            category_id: input.categoryId,
            notes: input.notes,
            source: 'manual',
            parse_status: 'parsed',
            confidence: 1,
            raw_text: rawText,
            raw_hash: rawHash,
          })
          .select()
          .single(),
      );
    },
    onSettled: invalidate,
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, amount, currency }: { categoryId: string; amount: number; currency: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap<BudgetRow>(
        supabase
          .from('budgets')
          .upsert(
            { user_id: userId, category_id: categoryId, amount, currency },
            { onConflict: 'user_id,category_id' },
          )
          .select()
          .single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(supabase.from('budgets').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: userData } = await supabase.auth.getUser();
      return unwrap<CategoryRow>(
        supabase
          .from('categories')
          .insert({ name, user_id: userData.user?.id })
          .select()
          .single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) =>
      unwrap<CategoryRow>(
        supabase.from('categories').update({ color }).eq('id', id).select().single(),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(supabase.from('categories').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteAllBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap(supabase.from('budgets').delete().eq('user_id', userId));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useCreateIngestToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: string }) =>
      unwrap<string>(supabase.rpc('create_ingest_token', { p_name: name, p_kind: kind })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['ingest_devices'] }),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    // Via RPC: direct writes to ingest_devices are no longer granted to
    // clients (migration 11, HANDOFF §18 SEC-3).
    mutationFn: async (id: string) =>
      unwrap(supabase.rpc('revoke_ingest_device', { p_device_id: id })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['ingest_devices'] }),
  });
}

/**
 * Removes a revoked device row for good. Only ever offered on already-revoked
 * devices (HANDOFF §19): revoking is the safety-critical step and stays
 * one-way, while deleting is just clearing the list afterwards. Delete is
 * still granted to clients — migration 11 narrowed only insert and update.
 */
export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(supabase.from('ingest_devices').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['ingest_devices'] }),
  });
}

/** Mirrors MAX_DESCRIPTION in supabase/functions/_shared/feedback.ts, which is
 *  the cap that actually counts — this one just stops the keyboard before the
 *  server has to refuse the submission. */
export const MAX_FEEDBACK_DESCRIPTION = 4000;

/**
 * Bug reports and feature requests both go through the `feedback` edge
 * function rather than a direct table insert: the function writes the row
 * under the caller's JWT (RLS unchanged) and then emails a copy. The row is
 * the source of truth — `emailed: false` means the notification did not go
 * out, not that the submission was lost, so it is not surfaced to the user.
 */
async function submitFeedback(payload: {
  kind: 'bug' | 'feature';
  short_id: string;
  app_version: string;
  area?: string;
  description: string;
}) {
  const { error } = await supabase.functions.invoke('feedback', { body: payload });
  if (error) throw new Error(error.message);
}

export function useSubmitBugReport() {
  return useMutation({
    mutationFn: (report: { short_id: string; app_version: string; description: string }) =>
      submitFeedback({ kind: 'bug', ...report }),
  });
}

export function useSubmitFeatureRequest() {
  return useMutation({
    mutationFn: (request: {
      short_id: string;
      app_version: string;
      area: string;
      description: string;
    }) => submitFeedback({ kind: 'feature', ...request }),
  });
}

// ---------------------------------------------------------------- realtime

/** Invalidate transaction queries on any realtime insert/update — Shortcut
 *  and listener-ingested spends appear live. */
export function useRealtimeTransactions() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('tx-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        invalidateTransactionQueries(qc);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
