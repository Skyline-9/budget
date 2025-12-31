import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import type { ApiClient } from "@/api/types";
import type { Budget, CategoryCreate, CategoryUpdate, TransactionCreate, TransactionUpdate } from "@/types";
import { ApiError, fetchJson } from "@/api/real/fetchJson";

type BackendTransaction = {
  id: string;
  date: string; // YYYY-MM-DD
  amount_cents: number;
  category_id: string;
  merchant?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
};

type BackendTransactionListResponse = {
  items: BackendTransaction[];
  total: number;
  limit: number;
  offset: number;
};

type BackendCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  parent_id?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type BackendDashboardSummary = {
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  savings_rate: number | null;
};

type BackendDashboardTrendResponse = {
  interval: "month" | "day";
  points: Array<{
    period: string; // YYYY-MM (month) or YYYY-MM-DD (day)
    income_cents: number;
    expense_cents: number;
    net_cents: number;
  }>;
};

type BackendDashboardByCategoryResponse = {
  kind: "expense" | "income";
  items: Array<{
    category_id: string;
    category_name: string;
    total_cents: number;
  }>;
};

type BackendDashboardCategoryTrendResponse = {
  interval: "month";
  kind: "expense" | "income";
  periods: string[]; // YYYY-MM
  series: Array<{
    category_id: string;
    category_name: string;
    total_cents: number;
    values_cents: number[];
  }>;
};

type BackendBudget = {
  month: string; // YYYY-MM
  category_id: string;
  budget_cents: number;
};

function toBackendTransactionCreate(payload: TransactionCreate) {
  return {
    date: payload.date,
    amount_cents: payload.amountCents,
    category_id: payload.categoryId,
    merchant: payload.merchant,
    notes: payload.notes,
  };
}

function toBackendTransactionUpdate(payload: TransactionUpdate) {
  const out: Record<string, unknown> = {};
  if ("date" in payload && payload.date !== undefined) out.date = payload.date;
  if ("amountCents" in payload && payload.amountCents !== undefined) out.amount_cents = payload.amountCents;
  if ("categoryId" in payload && payload.categoryId !== undefined) out.category_id = payload.categoryId;
  if ("merchant" in payload && payload.merchant !== undefined) out.merchant = payload.merchant;
  if ("notes" in payload && payload.notes !== undefined) out.notes = payload.notes;
  return out;
}

function fromBackendTransaction(t: BackendTransaction) {
  return {
    id: t.id,
    date: t.date,
    amountCents: t.amount_cents,
    categoryId: t.category_id,
    merchant: t.merchant ?? undefined,
    notes: t.notes ?? undefined,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function toBackendCategoryCreate(payload: CategoryCreate) {
  return {
    name: payload.name,
    kind: payload.kind,
    parent_id: payload.parentId ?? null,
    active: payload.active,
  };
}

function toBackendCategoryUpdate(payload: CategoryUpdate) {
  const out: Record<string, unknown> = {};
  if ("name" in payload && payload.name !== undefined) out.name = payload.name;
  if ("kind" in payload && payload.kind !== undefined) out.kind = payload.kind;
  if ("parentId" in payload && payload.parentId !== undefined) out.parent_id = payload.parentId;
  if ("active" in payload && payload.active !== undefined) out.active = payload.active;
  return out;
}

function fromBackendCategory(c: BackendCategory) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parent_id ?? null,
    active: c.active,
  };
}

function fromBackendBudget(b: BackendBudget): Budget {
  return {
    month: b.month,
    categoryId: b.category_id ?? "",
    budgetCents: b.budget_cents,
  };
}

function trendIntervalForRange(from?: string, to?: string) {
  if (!from || !to) return "month" as const;
  const a = parseISO(from);
  const b = parseISO(to);
  if (!isValid(a) || !isValid(b)) return "month" as const;
  const diffDays = Math.abs(differenceInCalendarDays(b, a));
  // "One month or less" (UX heuristic): treat <= 31 days as daily granularity.
  return diffDays <= 31 ? ("day" as const) : ("month" as const);
}

/**
 * Real API client (fetch-based).
 *
 * Expected server routes (recommended):
 * - GET    /transactions?from&to&q&categoryId&minAmountCents&maxAmountCents
 * - POST   /transactions
 * - PATCH  /transactions/:id
 * - DELETE /transactions/:id
 * - GET    /categories
 * - POST   /categories
 * - PATCH  /categories/:id
 * - GET    /budgets/overall?month=YYYY-MM
 * - PUT    /budgets/overall
 * - DELETE /budgets/overall?month=YYYY-MM
 * - GET    /dashboard/summary?from&to&...
 * - GET    /dashboard/charts?from&to&...
 */
export const realApiClient: ApiClient = {
  async getTransactions(params) {
    // Backend supports pagination; frontend currently expects an array.
    const pageSize = 1000;
    let offset = 0;
    const out: any[] = [];

    while (true) {
      const page = await fetchJson<BackendTransactionListResponse>("/api/transactions", {
        method: "GET",
        query: {
          from: params.from,
          to: params.to,
          q: params.q,
          minAmountCents: params.minAmountCents,
          maxAmountCents: params.maxAmountCents,
          categoryId: params.categoryId?.join(","),
          limit: pageSize,
          offset,
        },
      });

      out.push(...page.items.map(fromBackendTransaction));
      if (page.items.length < pageSize) break;
      offset += pageSize;
    }

    return out;
  },

  async createTransaction(payload: TransactionCreate) {
    const created = await fetchJson<BackendTransaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(toBackendTransactionCreate(payload)),
    });
    return fromBackendTransaction(created);
  },

  async updateTransaction(id: string, payload: TransactionUpdate) {
    const updated = await fetchJson<BackendTransaction>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(toBackendTransactionUpdate(payload)),
    });
    return fromBackendTransaction(updated);
  },

  async deleteTransaction(id: string) {
    await fetchJson(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { ok: true as const };
  },

  async getCategories() {
    const categories = await fetchJson<BackendCategory[]>("/api/categories", { method: "GET" });
    return categories.map(fromBackendCategory);
  },

  async createCategory(payload: CategoryCreate) {
    const created = await fetchJson<BackendCategory>("/api/categories", {
      method: "POST",
      body: JSON.stringify(toBackendCategoryCreate(payload)),
    });
    return fromBackendCategory(created);
  },

  async updateCategory(id: string, payload: CategoryUpdate) {
    const updated = await fetchJson<BackendCategory>(`/api/categories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(toBackendCategoryUpdate(payload)),
    });
    return fromBackendCategory(updated);
  },

  async deleteCategory(id: string, opts: { reassignToCategoryId: string }) {
    await fetchJson(`/api/categories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      query: { reassignTo: opts.reassignToCategoryId },
    });
    return { ok: true as const };
  },

  async getOverallBudget(month: string) {
    try {
      const b = await fetchJson<BackendBudget>("/api/budgets/overall", { method: "GET", query: { month } });
      return fromBackendBudget(b);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  async upsertOverallBudget(payload: { month: string; budgetCents: number }) {
    const b = await fetchJson<BackendBudget>("/api/budgets/overall", {
      method: "PUT",
      body: JSON.stringify({ month: payload.month, budget_cents: payload.budgetCents }),
    });
    return fromBackendBudget(b);
  },

  async deleteOverallBudget(month: string) {
    await fetchJson("/api/budgets/overall", { method: "DELETE", query: { month } });
    return { ok: true as const };
  },

  async getDashboardSummary(params) {
    const summary = await fetchJson<BackendDashboardSummary>("/api/dashboard/summary", {
      method: "GET",
      query: {
        from: params.from,
        to: params.to,
        q: params.q,
        minAmountCents: params.minAmountCents,
        maxAmountCents: params.maxAmountCents,
        categoryId: params.categoryId?.join(","),
      },
    });
    return {
      incomeCents: summary.income_cents,
      expenseCents: summary.expense_cents,
      netCents: summary.net_cents,
      savingsRate: summary.savings_rate ?? 0,
    };
  },

  async getDashboardCharts(params) {
    const query = {
      from: params.from,
      to: params.to,
      q: params.q,
      minAmountCents: params.minAmountCents,
      maxAmountCents: params.maxAmountCents,
      categoryId: params.categoryId?.join(","),
    };

    const interval = trendIntervalForRange(params.from, params.to);
    const [trend, byCategory, categoryTrend] = await Promise.all([
      fetchJson<BackendDashboardTrendResponse>("/api/dashboard/trend", {
        method: "GET",
        query: { ...query, interval },
      }),
      fetchJson<BackendDashboardByCategoryResponse>("/api/dashboard/by-category", {
        method: "GET",
        query: { ...query, kind: "expense", limit: 12 },
      }),
      fetchJson<BackendDashboardCategoryTrendResponse>("/api/dashboard/category-trend", {
        method: "GET",
        query: { ...query, kind: "expense", limit: 8 },
      }),
    ]);

    const categoryItems = byCategory.items.map((i) => ({
      categoryId: i.category_id,
      categoryName: i.category_name,
      totalCents: i.total_cents,
    }));

    return {
      trendInterval: trend.interval,
      monthlyTrend: trend.points.map((p) => ({
        month: p.period,
        incomeCents: p.income_cents,
        expenseCents: p.expense_cents,
      })),
      categoryBreakdown: categoryItems,
      categoryShare: categoryItems,
      categoryMonthly: {
        months: categoryTrend.periods,
        series: categoryTrend.series.map((s) => ({
          categoryId: s.category_id,
          categoryName: s.category_name,
          totalCents: s.total_cents,
          valuesCents: s.values_cents,
        })),
      },
    };
  },
};


