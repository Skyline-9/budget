export type DashboardSummary = {
  incomeCents: number;
  expenseCents: number; // positive number (absolute)
  netCents: number; // income - expense
  savingsRate: number; // 0..1
};

export type TrendInterval = "month" | "day";

export type MonthlyTrendPoint = {
  month: string; // YYYY-MM (monthly) or YYYY-MM-DD (daily)
  incomeCents: number;
  expenseCents: number;
};

export type CategoryBreakdownItem = {
  categoryId: string;
  categoryName: string;
  totalCents: number;
};

export type CategoryMonthlySeries = {
  categoryId: string;
  categoryName: string;
  totalCents: number;
  valuesCents: number[]; // aligned with `months`
};

export type CategoryMonthly = {
  months: string[]; // YYYY-MM
  series: CategoryMonthlySeries[];
};

export type DashboardCharts = {
  trendInterval: TrendInterval;
  monthlyTrend: MonthlyTrendPoint[];
  categoryBreakdown: CategoryBreakdownItem[]; // typically expenses
  categoryShare: CategoryBreakdownItem[]; // for donut
  categoryMonthly: CategoryMonthly; // expenses by month for the "Top categories" chart
};


