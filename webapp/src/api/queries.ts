import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/api";
import type { GetDashboardParams, GetTransactionsParams } from "@/api/types";
import type { Budget, CategoryCreate, CategoryUpdate, Transaction, TransactionCreate, TransactionUpdate } from "@/types";
import { emitTransactionUiEvent } from "@/lib/transactionUiEvents";

function normalizeParams<T extends { categoryId?: string[] }>(params: T): T {
  const copy: any = { ...params };
  if (Array.isArray(copy.categoryId)) {
    const sorted = [...copy.categoryId].filter(Boolean).sort();
    copy.categoryId = sorted.length ? sorted : undefined;
  }
  return copy;
}

export const qk = {
  categories: () => ["categories"] as const,
  transactions: (params: GetTransactionsParams) => ["transactions", normalizeParams(params)] as const,
  dashboardSummary: (params: GetDashboardParams) =>
    ["dashboardSummary", normalizeParams(params)] as const,
  dashboardCharts: (params: GetDashboardParams) => ["dashboardCharts", normalizeParams(params)] as const,
  overallBudget: (month: string) => ["overallBudget", month] as const,
};

export function useCategoriesQuery() {
  return useQuery({
    queryKey: qk.categories(),
    queryFn: () => api.getCategories(),
  });
}

export function useTransactionsQuery(params: GetTransactionsParams) {
  return useQuery({
    queryKey: qk.transactions(params),
    queryFn: () => api.getTransactions(params),
  });
}

export function useDashboardSummaryQuery(params: GetDashboardParams) {
  return useQuery({
    queryKey: qk.dashboardSummary(params),
    queryFn: () => api.getDashboardSummary(params),
  });
}

export function useDashboardChartsQuery(params: GetDashboardParams) {
  return useQuery({
    queryKey: qk.dashboardCharts(params),
    queryFn: () => api.getDashboardCharts(params),
  });
}

export function useOverallBudgetQuery(month?: string) {
  return useQuery({
    queryKey: qk.overallBudget(month ?? ""),
    queryFn: () => api.getOverallBudget(month!),
    enabled: Boolean(month),
  });
}

export function useOverallBudgetsQuery(months: string[]) {
  const uniqueMonths = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of months) {
      const mm = (m ?? "").trim();
      if (!mm) continue;
      if (seen.has(mm)) continue;
      seen.add(mm);
      out.push(mm);
    }
    return out;
  }, [months]);

  return useQueries({
    queries: uniqueMonths.map((month) => ({
      queryKey: qk.overallBudget(month),
      queryFn: () => api.getOverallBudget(month),
    })),
  });
}

function useToastOnError() {
  return React.useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : "Something went wrong";
    toast.error(message);
  }, []);
}

export function useUpsertOverallBudgetMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: (payload: { month: string; budgetCents: number }) => api.upsertOverallBudget(payload),
    onSuccess: async (_budget: Budget) => {
      toast.success("Budget saved");
      await qc.invalidateQueries({ queryKey: ["overallBudget"] });
    },
    onError,
  });
}

export function useDeleteOverallBudgetMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: (month: string) => api.deleteOverallBudget(month),
    onSuccess: async () => {
      toast.success("Budget removed");
      await qc.invalidateQueries({ queryKey: ["overallBudget"] });
    },
    onError,
  });
}

export function useCreateTransactionMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: (payload: TransactionCreate) => api.createTransaction(payload),
    onSuccess: async (created) => {
      emitTransactionUiEvent({ type: "created", transaction: created });
      toast.success("Transaction added");
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
      await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
    },
    onError,
  });
}

export function useUpdateTransactionMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TransactionUpdate }) =>
      api.updateTransaction(id, payload),
    onSuccess: async (updated) => {
      emitTransactionUiEvent({ type: "updated", transaction: updated });
      toast.success("Transaction updated");
      // Update cached transaction lists quickly (then invalidate to sync with filters/server).
      qc.setQueriesData({ queryKey: ["transactions"] }, (old: Transaction[] | undefined) => {
        if (!old) return old;
        return old.map((t) => (t.id === updated.id ? updated : t));
      });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
      await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
    },
    onError,
  });
}

export function useDeleteTransactionMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: (vars: { id: string; transaction?: Transaction }) => api.deleteTransaction(vars.id),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["transactions"] });
      const prev = qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] });
      qc.setQueriesData({ queryKey: ["transactions"] }, (old: Transaction[] | undefined) => {
        if (!old) return old;
        return old.filter((t) => t.id !== vars.id);
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) qc.setQueryData(key, data);
      }
      onError(err);
    },
    onSuccess: async (_res, vars) => {
      emitTransactionUiEvent({ type: "deleted", id: vars.id, transaction: vars.transaction });
      toast.success("Transaction deleted", {
        action: vars.transaction
          ? {
              label: "Undo",
              onClick: async () => {
                try {
                  const t = vars.transaction!;
                  const restored = await api.createTransaction({
                    date: t.date,
                    categoryId: t.categoryId,
                    amountCents: t.amountCents,
                    merchant: t.merchant,
                    notes: t.notes,
                  });
                  emitTransactionUiEvent({ type: "created", transaction: restored });
                  toast.success("Transaction restored");
                  await qc.invalidateQueries({ queryKey: ["transactions"] });
                  await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
                  await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
                } catch (e) {
                  const message = e instanceof Error ? e.message : "Undo failed";
                  toast.error(message);
                }
              },
            }
          : undefined,
      });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
      await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
    },
  });
}

export function useCreateCategoryMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: (payload: CategoryCreate) => api.createCategory(payload),
    onSuccess: async () => {
      toast.success("Category created");
      await qc.invalidateQueries({ queryKey: qk.categories() });
    },
    onError,
  });
}

export function useUpdateCategoryMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CategoryUpdate }) =>
      api.updateCategory(id, payload),
    onSuccess: async () => {
      toast.success("Category updated");
      await qc.invalidateQueries({ queryKey: qk.categories() });
      await qc.invalidateQueries({ queryKey: ["transactions"] }); // category labels used in tables
      await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
    },
    onError,
  });
}

export function useDeleteCategoryMutation() {
  const qc = useQueryClient();
  const onError = useToastOnError();
  return useMutation({
    mutationFn: ({ id, reassignToCategoryId }: { id: string; reassignToCategoryId: string }) =>
      api.deleteCategory(id, { reassignToCategoryId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.categories() });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
      await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
    },
    onError,
  });
}




