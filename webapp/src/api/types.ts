import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  Budget,
  DashboardCharts,
  DashboardSummary,
  Transaction,
  TransactionCreate,
  TransactionUpdate,
} from "@/types";

export type DateRangeParams = {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
};

export type GetTransactionsParams = DateRangeParams & {
  q?: string;
  categoryId?: string[]; // multi-select
  minAmountCents?: number;
  maxAmountCents?: number;
};

export type GetDashboardParams = DateRangeParams & {
  q?: string;
  categoryId?: string[];
  minAmountCents?: number;
  maxAmountCents?: number;
};

export type ApiClient = {
  getTransactions: (params: GetTransactionsParams) => Promise<Transaction[]>;
  createTransaction: (payload: TransactionCreate) => Promise<Transaction>;
  updateTransaction: (id: string, payload: TransactionUpdate) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<{ ok: true }>;

  getCategories: () => Promise<Category[]>;
  createCategory: (payload: CategoryCreate) => Promise<Category>;
  updateCategory: (id: string, payload: CategoryUpdate) => Promise<Category>;
  deleteCategory: (id: string, opts: { reassignToCategoryId: string }) => Promise<{ ok: true }>;

  getOverallBudget: (month: string) => Promise<Budget | null>;
  upsertOverallBudget: (payload: { month: string; budgetCents: number }) => Promise<Budget>;
  deleteOverallBudget: (month: string) => Promise<{ ok: true }>;

  getDashboardSummary: (params: GetDashboardParams) => Promise<DashboardSummary>;
  getDashboardCharts: (params: GetDashboardParams) => Promise<DashboardCharts>;
};




