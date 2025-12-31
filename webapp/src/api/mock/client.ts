import type { ApiClient } from "@/api/types";
import type { CategoryCreate, CategoryUpdate, TransactionCreate, TransactionUpdate } from "@/types";
import {
  getMockDb,
  mockDashboardCharts,
  mockDashboardSummary,
  mockDeleteOverallBudget,
  mockDeleteCategory,
  mockDeleteTransaction,
  mockFilterTransactions,
  mockInsertCategory,
  mockInsertTransaction,
  mockGetOverallBudget,
  mockUpsertOverallBudget,
  mockUpdateCategory,
  mockUpdateTransaction,
} from "@/api/mock/db";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 160;

export const mockApiClient: ApiClient = {
  async getTransactions(params) {
    await sleep(LATENCY_MS);
    return mockFilterTransactions(params);
  },

  async createTransaction(payload: TransactionCreate) {
    await sleep(LATENCY_MS);
    return mockInsertTransaction(payload);
  },

  async updateTransaction(id: string, payload: TransactionUpdate) {
    await sleep(LATENCY_MS);
    return mockUpdateTransaction(id, payload);
  },

  async deleteTransaction(id: string) {
    await sleep(LATENCY_MS);
    return mockDeleteTransaction(id);
  },

  async getCategories() {
    await sleep(LATENCY_MS);
    return getMockDb().categories.slice();
  },

  async createCategory(payload: CategoryCreate) {
    await sleep(LATENCY_MS);
    return mockInsertCategory(payload);
  },

  async updateCategory(id: string, payload: CategoryUpdate) {
    await sleep(LATENCY_MS);
    return mockUpdateCategory(id, payload);
  },

  async deleteCategory(id: string, opts: { reassignToCategoryId: string }) {
    await sleep(LATENCY_MS);
    return mockDeleteCategory(id, opts);
  },

  async getOverallBudget(month: string) {
    await sleep(LATENCY_MS);
    return mockGetOverallBudget(month);
  },

  async upsertOverallBudget(payload: { month: string; budgetCents: number }) {
    await sleep(LATENCY_MS);
    return mockUpsertOverallBudget(payload);
  },

  async deleteOverallBudget(month: string) {
    await sleep(LATENCY_MS);
    return mockDeleteOverallBudget(month);
  },

  async getDashboardSummary(params) {
    await sleep(LATENCY_MS);
    return mockDashboardSummary(params);
  },

  async getDashboardCharts(params) {
    await sleep(LATENCY_MS);
    return mockDashboardCharts(params);
  },
};


