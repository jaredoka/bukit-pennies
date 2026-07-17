import { normalizeMerchant } from '@bukit/parsers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { bruneiMonthStartIso } from './format';
import { supabase } from './supabase';
import type {
  BudgetRow,
  CategoryRow,
  IngestDeviceRow,
  MerchantTotalRow,
  MonthlyTotalRow,
  ProfileRow,
  SavingsGoalRow,
  TransactionRow,
} from './types';

/** SGD circulates 1:1 with BND in Brunei (Currency Interchangeability
 *  Agreement) — SGD amounts count toward BND totals at par. */
export const PAR_CURRENCIES = ['BND', 'SGD'];

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data as T;
}

// ------------------------------------------------------------------ queries

export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () =>
      unwrap<TransactionRow[]>(
        supabase
          .from('transactions')
          .select('*')
          .order('occurred_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(500),
      ),
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

/** needs_review rows plus flagged near-duplicates, oldest first. */
export function useReviewItems() {
  return useQuery({
    queryKey: ['transactions', 'review'],
    queryFn: () =>
      unwrap<TransactionRow[]>(
        supabase
          .from('transactions')
          .select('*')
          .or('parse_status.eq.needs_review,possible_duplicate_of.not.is.null')
          .order('created_at', { ascending: true }),
      ),
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

export function useTopMerchants(limit = 8) {
  return useQuery({
    queryKey: ['merchant_totals', limit],
    queryFn: () =>
      unwrap<MerchantTotalRow[]>(
        supabase
          .from('merchant_totals')
          .select('*')
          .order('total', { ascending: false })
          .limit(limit),
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
      unwrap<Pick<TransactionRow, 'occurred_at' | 'amount' | 'currency' | 'category_id' | 'merchant_normalized'>[]>(
        supabase
          .from('transactions')
          .select('occurred_at, amount, currency, category_id, merchant_normalized')
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .in('currency', PAR_CURRENCIES)
          .gte('occurred_at', since),
      ),
  });
}

/** Parsed spends of the last `monthsBack` Brunei months — recurring detection. */
export function useRecentMonthsTransactions(monthsBack = 6) {
  const since = bruneiMonthStartIso(monthsBack - 1);
  return useQuery({
    queryKey: ['transactions', 'recent-months', since],
    queryFn: () =>
      unwrap<Pick<TransactionRow, 'occurred_at' | 'amount' | 'currency' | 'merchant_normalized'>[]>(
        supabase
          .from('transactions')
          .select('occurred_at, amount, currency, merchant_normalized')
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .not('occurred_at', 'is', null)
          .not('merchant_normalized', 'is', null)
          .gte('occurred_at', since),
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

export function useDevices() {
  return useQuery({
    queryKey: ['ingest_devices'],
    queryFn: () =>
      unwrap<IngestDeviceRow[]>(
        supabase.from('ingest_devices').select('*').order('created_at', { ascending: false }),
      ),
  });
}

export function useSavingsGoals() {
  return useQuery({
    queryKey: ['savings_goals'],
    queryFn: () =>
      unwrap<SavingsGoalRow[]>(
        supabase.from('savings_goals').select('*').order('created_at', { ascending: true }),
      ),
  });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, target }: { name: string; target: number }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap<SavingsGoalRow>(
        supabase
          .from('savings_goals')
          .insert({ user_id: userId, name, target_amount: target })
          .select()
          .single(),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
  });
}

export function useAddToSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, amount }: { goal: SavingsGoalRow; amount: number }) =>
      unwrap<SavingsGoalRow>(
        supabase
          .from('savings_goals')
          .update({ saved_amount: Number(goal.saved_amount) + amount })
          .eq('id', goal.id)
          .select()
          .single(),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(supabase.from('savings_goals').delete().eq('id', id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
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
      await qc.refetchQueries({ type: 'active' });
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
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['monthly_totals'] });
    qc.invalidateQueries({ queryKey: ['merchant_totals'] });
  };
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTx();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TransactionRow> }) =>
      unwrap<TransactionRow>(
        supabase.from('transactions').update(patch).eq('id', id).select().single(),
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
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');
      return unwrap<BudgetRow>(
        supabase
          .from('budgets')
          .upsert(
            { user_id: userId, category_id: categoryId, amount },
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
    mutationFn: async (id: string) =>
      unwrap(
        supabase
          .from('ingest_devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['ingest_devices'] }),
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
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['monthly_totals'] });
        qc.invalidateQueries({ queryKey: ['merchant_totals'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
