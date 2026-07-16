import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { bruneiMonthStartIso } from './format';
import { supabase } from './supabase';
import type {
  CategoryRow,
  IngestDeviceRow,
  MerchantTotalRow,
  MonthlyTotalRow,
  TransactionRow,
} from './types';

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

/** Parsed transactions of the current Brunei month — daily-spend chart. */
export function useThisMonthTransactions() {
  const since = bruneiMonthStartIso(0);
  return useQuery({
    queryKey: ['transactions', 'month', since],
    queryFn: () =>
      unwrap<Pick<TransactionRow, 'occurred_at' | 'amount'>[]>(
        supabase
          .from('transactions')
          .select('occurred_at, amount')
          .eq('parse_status', 'parsed')
          .not('amount', 'is', null)
          .gte('occurred_at', since),
      ),
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
