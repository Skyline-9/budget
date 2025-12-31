import React from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Plus, TrendingUp, TrendingDown, Minus, PiggyBank } from "lucide-react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  useCategoriesQuery,
  useDashboardChartsQuery,
  useDashboardSummaryQuery,
  useOverallBudgetsQuery,
} from "@/api/queries";
import { ActiveFilterChips, type DashboardFilterState } from "@/components/dashboard/ActiveFilterChips";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { MetricCard, type MetricDelta } from "@/components/dashboard/MetricCard";
import { BudgetCard } from "@/components/dashboard/BudgetCard";
import { QuickInsights } from "@/components/dashboard/QuickInsights";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnimatedMoneyCents } from "@/components/motion/AnimatedNumber";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent01 } from "@/lib/format";
import {
  parseMoneyToCents,
  readString,
  readStringList,
  writeListOrDelete,
  writeOrDelete,
} from "@/lib/urlState";

const DashboardChartsLazy = React.lazy(() => import("@/components/dashboard/DashboardCharts"));

function thisMonthRange() {
  const now = new Date();
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

function labelForRange(from?: string, to?: string) {
  if (!from && !to) return "All time";
  const tm = thisMonthRange();
  if (from === tm.from && to === tm.to) return "This month";
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  return `To ${to}`;
}

function computeComparisonRange(from?: string, to?: string) {
  if (!from || !to) return undefined;
  const fromDate = parseISO(from);
  const toDate = parseISO(to);

  const fullMonth =
    isSameMonth(fromDate, toDate) &&
    from === format(startOfMonth(fromDate), "yyyy-MM-dd") &&
    to === format(endOfMonth(fromDate), "yyyy-MM-dd");

  if (fullMonth) {
    const prevMonth = subMonths(fromDate, 1);
    return {
      prevFrom: format(startOfMonth(prevMonth), "yyyy-MM-dd"),
      prevTo: format(endOfMonth(prevMonth), "yyyy-MM-dd"),
      label: "vs prior month",
    };
  }

  const days = differenceInCalendarDays(toDate, fromDate) + 1;
  const prevToDate = addDays(fromDate, -1);
  const prevFromDate = addDays(prevToDate, -(days - 1));
  return {
    prevFrom: format(prevFromDate, "yyyy-MM-dd"),
    prevTo: format(prevToDate, "yyyy-MM-dd"),
    label: "vs previous period",
  };
}

function normalizedDateRange(from?: string, to?: string) {
  if (!from || !to) return undefined;
  const a = parseISO(from);
  const b = parseISO(to);
  if (!isValid(a) || !isValid(b)) return undefined;
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  return { start, end };
}

function monthKeysForRange(from?: string, to?: string) {
  const r = normalizedDateRange(from, to);
  if (!r) return [] as string[];
  const start = startOfMonth(r.start);
  const end = startOfMonth(r.end);
  const out: string[] = [];
  for (let d = start; d <= end; d = addMonths(d, 1)) out.push(format(d, "yyyy-MM"));
  return out;
}

function formatSignedCents(diffCents: number) {
  const abs = formatCents(Math.abs(diffCents));
  if (diffCents > 0) return `+${abs}`;
  if (diffCents < 0) return `-${abs}`;
  return abs;
}

function formatSignedPercent(diff: number) {
  const abs = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
    Math.abs(diff),
  );
  if (diff > 0) return `(+${abs})`;
  if (diff < 0) return `(-${abs})`;
  return `(${abs})`;
}

function formatSignedPp(diff: number) {
  const abs = Math.abs(diff * 100);
  const absText = `${abs.toFixed(1)}pp`;
  if (diff > 0) return `+${absText}`;
  if (diff < 0) return `-${absText}`;
  return absText;
}

export function DashboardPage() {
  const { openAddTransaction } = useOutletContext<{ openAddTransaction: () => void }>();
  const [sp, setSp] = useSearchParams();
  const from = readString(sp, "from");
  const to = readString(sp, "to");

  React.useEffect(() => {
    // Default dashboard to "This month" if no explicit range.
    if (from || to) return;
    const next = new URLSearchParams(sp);
    const r = thisMonthRange();
    writeOrDelete(next, "from", r.from);
    writeOrDelete(next, "to", r.to);
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = readString(sp, "q");
  const categoryId = readStringList(sp, "categoryId") ?? [];
  const min = readString(sp, "min");
  const max = readString(sp, "max");

  const filters: DashboardFilterState = {
    from,
    to,
    q,
    categoryId,
    min: min ?? undefined,
    max: max ?? undefined,
  };

  const setFilters = React.useCallback(
    (patch: Partial<DashboardFilterState>) => {
      const next = new URLSearchParams(sp);
      if ("from" in patch) writeOrDelete(next, "from", patch.from);
      if ("to" in patch) writeOrDelete(next, "to", patch.to);
      if ("q" in patch) writeOrDelete(next, "q", patch.q);
      if ("min" in patch) writeOrDelete(next, "min", patch.min);
      if ("max" in patch) writeOrDelete(next, "max", patch.max);
      if ("categoryId" in patch) {
        const list = patch.categoryId ?? [];
        writeListOrDelete(next, "categoryId", list.length ? list : undefined);
      }
      setSp(next, { replace: true });
    },
    [setSp, sp],
  );

  const categoriesQuery = useCategoriesQuery();
  const categories = categoriesQuery.data ?? [];
  const categoriesById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const minAmountCents = parseMoneyToCents(min);
  const maxAmountCents = parseMoneyToCents(max);

  const params = {
    from,
    to,
    q,
    categoryId: categoryId.length ? categoryId : undefined,
    minAmountCents,
    maxAmountCents,
  };
  const summaryQuery = useDashboardSummaryQuery(params);
  const chartsQuery = useDashboardChartsQuery(params);
  const rangeLabel = labelForRange(from, to);

  const comparison = computeComparisonRange(from, to);
  const prevSummaryQuery = useDashboardSummaryQuery(
    comparison
      ? {
          ...params,
          from: comparison.prevFrom,
          to: comparison.prevTo,
        }
      : params,
  );

  const deltas = React.useMemo(() => {
    if (!summaryQuery.data || !comparison) return undefined;
    if (!prevSummaryQuery.data) return undefined;

    const cur = summaryQuery.data;
    const prev = prevSummaryQuery.data;
    const label = comparison.label;

    const incomeDiff = cur.incomeCents - prev.incomeCents;
    const incomePct = prev.incomeCents !== 0 ? incomeDiff / prev.incomeCents : undefined;

    const expenseDiff = cur.expenseCents - prev.expenseCents;
    const expensePct = prev.expenseCents !== 0 ? expenseDiff / prev.expenseCents : undefined;

    const netDiff = cur.netCents - prev.netCents;
    const netPct = prev.netCents !== 0 ? netDiff / prev.netCents : undefined;

    const srDiff = cur.savingsRate - prev.savingsRate;

    const incomeDelta: MetricDelta = {
      label,
      valueText: formatSignedCents(incomeDiff),
      subText: incomePct === undefined ? undefined : formatSignedPercent(incomePct),
      intent: incomeDiff > 0 ? "positive" : incomeDiff < 0 ? "negative" : "neutral",
    };

    const expenseDelta: MetricDelta = {
      label,
      valueText: formatSignedCents(expenseDiff),
      subText: expensePct === undefined ? undefined : formatSignedPercent(expensePct),
      // Spending more is worse.
      intent: expenseDiff > 0 ? "negative" : expenseDiff < 0 ? "positive" : "neutral",
    };

    const netDelta: MetricDelta = {
      label,
      valueText: formatSignedCents(netDiff),
      subText: netPct === undefined ? undefined : formatSignedPercent(netPct),
      intent: netDiff > 0 ? "positive" : netDiff < 0 ? "negative" : "neutral",
    };

    const srDelta: MetricDelta = {
      label,
      valueText: formatSignedPp(srDiff),
      intent: srDiff > 0 ? "positive" : srDiff < 0 ? "negative" : "neutral",
    };

    return { incomeDelta, expenseDelta, netDelta, srDelta };
  }, [comparison, prevSummaryQuery.data, summaryQuery.data]);

  const sparklines = React.useMemo(() => {
    const trend = chartsQuery.data?.monthlyTrend ?? [];
    if (trend.length < 2) return undefined;
    const income = trend.map((p) => p.incomeCents);
    const expense = trend.map((p) => p.expenseCents);
    const net = trend.map((p) => p.incomeCents - p.expenseCents);
    const savings = trend.map((p) => (p.incomeCents > 0 ? (p.incomeCents - p.expenseCents) / p.incomeCents : 0));
    return { income, expense, net, savings };
  }, [chartsQuery.data?.monthlyTrend]);

  const monthsInRange = React.useMemo(() => monthKeysForRange(from, to), [from, to]);
  const budgetQueries = useOverallBudgetsQuery(monthsInRange);
  const budgetsLoading = monthsInRange.length ? budgetQueries.some((q) => q.isLoading) : false;
  const budgetsError = monthsInRange.length ? budgetQueries.some((q) => q.isError) : false;

  const budgetByMonth = React.useMemo(() => {
    const map = new Map<string, number | null>();
    for (let i = 0; i < monthsInRange.length; i++) {
      const m = monthsInRange[i]!;
      const b = budgetQueries[i]?.data ?? null;
      map.set(m, b ? b.budgetCents : null);
    }
    return map;
  }, [budgetQueries, monthsInRange]);

  const adjusted = React.useMemo(() => {
    const r = normalizedDateRange(from, to);
    if (!r || !monthsInRange.length) {
      return { adjustedBudgetCents: null as number | null, missingMonthsCount: 0, editMonth: format(new Date(), "yyyy-MM") };
    }

    let total = 0;
    let present = 0;
    let missing = 0;

    for (const m of monthsInRange) {
      const monthlyBudgetCents = budgetByMonth.get(m) ?? null;
      if (monthlyBudgetCents == null) {
        missing += 1;
        continue;
      }
      present += 1;

      const monthStart = parseISO(`${m}-01`);
      const monthEnd = endOfMonth(monthStart);
      const overlapStart = r.start > monthStart ? r.start : monthStart;
      const overlapEnd = r.end < monthEnd ? r.end : monthEnd;
      if (overlapStart > overlapEnd) continue;

      const coveredDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
      const daysInMonth = differenceInCalendarDays(monthEnd, monthStart) + 1;
      const prorated = Math.round((monthlyBudgetCents * coveredDays) / daysInMonth);
      total += prorated;
    }

    const adjustedBudgetCents = present ? total : null;
    // Prefer editing the first missing month in-range; otherwise edit the last month in-range.
    const firstMissing = monthsInRange.find((m) => (budgetByMonth.get(m) ?? null) == null);
    const editMonth = firstMissing ?? monthsInRange[monthsInRange.length - 1]!;
    return { adjustedBudgetCents, missingMonthsCount: missing, editMonth };
  }, [budgetByMonth, from, monthsInRange, to]);

  const editMonthBudgetCents = adjusted.editMonth ? budgetByMonth.get(adjusted.editMonth) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Header: title + controls (Tableau-like) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[220px]">
            <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
            <div className="mt-1 text-sm text-muted-foreground text-balance">
              {rangeLabel}. Click a category in charts to filter Transactions.
            </div>
          </div>

          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[540px]">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <FilterBar filters={filters} onChange={setFilters} />
              <Button
                onClick={openAddTransaction}
                className="shrink-0"
                aria-keyshortcuts="N"
                title="Shortcut: N"
              >
                <Plus className="h-4 w-4" />
                <span>Add Transaction</span>
                <kbd className="hidden sm:inline-flex items-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground/90">
                  N
                </kbd>
              </Button>
            </div>
          </div>
        </div>

        <ActiveFilterChips filters={filters} categoriesById={categoriesById} onChange={setFilters} />
      </section>

      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2">
          <Skeleton className="h-[260px] md:col-span-2 xl:col-span-1 xl:row-span-2" />
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
        </div>
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <div className="rounded-2xl border border-border/60 bg-card/35 p-6">
          <div className="text-sm font-semibold">Couldn’t load dashboard summary</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Try again, or switch API mode back to mock.
          </div>
        </div>
      ) : (
        <section
          className={cn(
            "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2",
            // Prevent layout shift when prev summary loads: cards render regardless.
            "min-h-[168px]",
          )}
        >
          <BudgetCard
            subtitle={rangeLabel}
            editMonth={adjusted.editMonth}
            editMonthBudgetCents={editMonthBudgetCents}
            expenseCents={summaryQuery.data.expenseCents}
            adjustedBudgetCents={adjusted.adjustedBudgetCents}
            missingMonthsCount={adjusted.missingMonthsCount}
            isLoading={budgetsLoading}
            isError={budgetsError}
            className="md:col-span-2 xl:col-span-1 xl:row-span-2"
          />
          <MetricCard
            title="Income"
            value={<AnimatedMoneyCents cents={summaryQuery.data.incomeCents} />}
            delta={deltas?.incomeDelta}
            sparkline={sparklines?.income}
            tone="income"
            icon={<TrendingUp className="h-4 w-4" />}
            showDots
          />
          <MetricCard
            title="Expenses"
            value={<AnimatedMoneyCents cents={summaryQuery.data.expenseCents} />}
            delta={deltas?.expenseDelta}
            sparkline={sparklines?.expense}
            tone="expense"
            icon={<TrendingDown className="h-4 w-4" />}
            showDots
          />
          <MetricCard
            title="Net"
            value={<AnimatedMoneyCents cents={summaryQuery.data.netCents} />}
            valueSubtle="Income − Expenses"
            delta={deltas?.netDelta}
            sparkline={sparklines?.net}
            tone={summaryQuery.data.netCents >= 0 ? "income" : "expense"}
            icon={<Minus className="h-4 w-4" />}
            showDots
          />
          <MetricCard
            title="Savings rate"
            value={formatPercent01(summaryQuery.data.savingsRate)}
            valueSubtle="Net / Income"
            delta={deltas?.srDelta}
            sparkline={sparklines?.savings}
            tone="warm"
            icon={<PiggyBank className="h-4 w-4" />}
            showDots
          />
          {chartsQuery.isLoading ? (
            <div
              className={cn(
                "rounded-2xl border border-border/60 bg-card/35 p-5",
                "corner-glow tint-neutral",
                "md:col-span-2 xl:col-span-3",
              )}
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-xl" />
                <Skeleton className="h-3 w-[140px]" />
              </div>
              <div className="mt-4 space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-[92%]" />
                <Skeleton className="h-5 w-[80%]" />
              </div>
              <Skeleton className="mt-4 h-8 w-full rounded-xl" />
            </div>
          ) : chartsQuery.isError || !chartsQuery.data ? null : (
            <QuickInsights
              summary={summaryQuery.data}
              charts={chartsQuery.data}
              from={from ?? undefined}
              to={to ?? undefined}
              className="md:col-span-2 xl:col-span-3"
            />
          )}
        </section>
      )}

      {chartsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-[380px] xl:col-span-2" />
          <Skeleton className="h-[380px]" />
          <Skeleton className="h-[420px] xl:col-span-3" />
        </div>
      ) : chartsQuery.isError || !chartsQuery.data ? (
        <div className="rounded-2xl border border-border/60 bg-card/35 p-6">
          <div className="text-sm font-semibold">Couldn’t load charts</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Try adjusting filters or refreshing.
          </div>
        </div>
      ) : (
        <React.Suspense
          fallback={
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Skeleton className="h-[380px] xl:col-span-2" />
              <Skeleton className="h-[380px]" />
              <Skeleton className="h-[420px] xl:col-span-3" />
            </div>
          }
        >
          <DashboardChartsLazy charts={chartsQuery.data} />
        </React.Suspense>
      )}
    </div>
  );
}

