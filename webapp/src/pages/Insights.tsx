import React from "react";
import { endOfMonth, format, getDaysInMonth, isValid, parseISO, startOfMonth } from "date-fns";
import { Activity, Lightbulb, PieChart, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCategoriesQuery, useDashboardChartsQuery, useDashboardSummaryQuery, useTransactionsQuery } from "@/api/queries";
import { ActiveFilterChips, type DashboardFilterState } from "@/components/dashboard/ActiveFilterChips";
import { AnomalyTable } from "@/components/insights/AnomalyTable";
import { RecurringList } from "@/components/insights/RecurringList";
import { SpendingHeatmap } from "@/components/insights/SpendingHeatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent01, formatRange } from "@/lib/format";
import { calculatePareto, calculateTrend, forecastMonthEnd } from "@/lib/analysis";
import { parseMoneyToCents, readString, readStringList, writeListOrDelete, writeOrDelete } from "@/lib/urlState";

function Card({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/35 p-5",
        "corner-glow tint-neutral",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:bg-card/45 hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        {icon ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-background/40 ring-1 ring-border/60 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span>{title}</span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function thisMonthKey(now: Date) {
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function InsightsPage() {
  const [sp, setSp] = useSearchParams();

  const from = readString(sp, "from");
  const to = readString(sp, "to");
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
  const transactionsQuery = useTransactionsQuery(params);

  const rangeLabel = formatRange(from, to);

  const derived = React.useMemo(() => {
    const now = new Date();
    const tm = thisMonthKey(now);
    const isThisMonth = from === tm.from && to === tm.to;

    const daysInMonth = getDaysInMonth(now);
    const forecast =
      isThisMonth && summaryQuery.data
        ? forecastMonthEnd(summaryQuery.data.expenseCents, now.getDate(), { daysInMonth })
        : null;

    const category = chartsQuery.data ? calculatePareto(chartsQuery.data.categoryBreakdown) : null;
    const topCategory = chartsQuery.data?.categoryBreakdown?.length
      ? [...chartsQuery.data.categoryBreakdown].sort((a, b) => b.totalCents - a.totalCents)[0]
      : null;
    const topSharePct =
      category && category.totalCents > 0 && topCategory ? (topCategory.totalCents / category.totalCents) * 100 : null;

    const interval = chartsQuery.data?.trendInterval ?? "month";
    const expenseSeries = chartsQuery.data?.monthlyTrend?.map((p) => p.expenseCents) ?? [];
    const window = interval === "day" ? 14 : 3;
    const recent = expenseSeries.slice(-window);
    const prior = expenseSeries.slice(-(window * 2), -window);
    const trend = recent.length && prior.length ? calculateTrend(recent, prior) : null;
    const trendLabel = interval === "day" ? `vs prior ${window} days` : `vs prior ${window} months`;

    return { isThisMonth, forecast, category, topCategory, topSharePct, trend, trendLabel };
  }, [chartsQuery.data, from, summaryQuery.data, to]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[220px]">
            <div className="text-2xl font-semibold tracking-tight">Insights</div>
            <div className="mt-1 text-sm text-muted-foreground text-balance">
              {rangeLabel}. Use the top bar to change date range and search; category filters carry over from Dashboard.
            </div>
          </div>
        </div>

        <ActiveFilterChips filters={filters} categoriesById={categoriesById} onChange={setFilters} />
      </section>

      {/* Overview cards */}
      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
          <Skeleton className="h-[126px]" />
        </div>
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <div className="rounded-2xl border border-border/60 bg-card/35 p-6">
          <div className="text-sm font-semibold">Couldn’t load insights summary</div>
          <div className="mt-1 text-sm text-muted-foreground">Try adjusting filters or refreshing.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Income" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatCents(summaryQuery.data.incomeCents)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{rangeLabel}</div>
          </Card>
          <Card title="Expenses" icon={<Activity className="h-4 w-4" />}>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatCents(summaryQuery.data.expenseCents)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{rangeLabel}</div>
          </Card>
          <Card title="Net" icon={<Lightbulb className="h-4 w-4" />}>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">{formatCents(summaryQuery.data.netCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Income − Expenses</div>
          </Card>
          <Card title="Savings rate" icon={<PieChart className="h-4 w-4" />}>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatPercent01(summaryQuery.data.savingsRate)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Net / Income</div>
          </Card>
        </div>
      )}

      {/* Analysis sections */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {transactionsQuery.isLoading ? (
          <Skeleton className="h-[360px] xl:col-span-2" />
        ) : transactionsQuery.isError || !transactionsQuery.data ? (
          <div className="rounded-2xl border border-border/60 bg-card/35 p-6 xl:col-span-2">
            <div className="text-sm font-semibold">Couldn’t load transactions</div>
            <div className="mt-1 text-sm text-muted-foreground">Some insights require transaction data.</div>
          </div>
        ) : (
          <SpendingHeatmap transactions={transactionsQuery.data} className="xl:col-span-2" />
        )}

        <div className="space-y-4">
          {chartsQuery.isLoading ? (
            <Skeleton className="h-[180px]" />
          ) : chartsQuery.isError || !chartsQuery.data ? (
            <Card title="Category concentration" icon={<PieChart className="h-4 w-4" />}>
              <div className="text-sm text-muted-foreground">Charts data unavailable for this filter.</div>
            </Card>
          ) : (
            <Card title="Category concentration" icon={<PieChart className="h-4 w-4" />}>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold tabular-nums">{derived.category?.categoriesFor80Percent ?? "—"}</span>{" "}
                  categories account for <span className="font-semibold tabular-nums">80%</span> of spend
                </div>
                {derived.topCategory && derived.topSharePct != null ? (
                  <div className="text-foreground/80">
                    Top category:{" "}
                    <span className="font-semibold">{derived.topCategory.categoryName}</span>{" "}
                    <span className="text-foreground/60">
                      ({derived.topSharePct.toFixed(1)}% · {formatCents(derived.topCategory.totalCents)})
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {[...chartsQuery.data.categoryBreakdown]
                  .sort((a, b) => b.totalCents - a.totalCents)
                  .slice(0, 6)
                  .map((c) => (
                    <div key={c.categoryId} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 truncate text-foreground/80">{c.categoryName}</div>
                      <div className="shrink-0 tabular-nums text-foreground/70">{formatCents(c.totalCents)}</div>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          <Card title="Trend & forecast" icon={<TrendingUp className="h-4 w-4" />}>
            {derived.trend ? (
              <div className="text-sm text-foreground/80">
                Spending{" "}
                <span className="font-semibold">
                  {derived.trend.direction === "stable"
                    ? "is flat"
                    : derived.trend.direction === "up"
                      ? "is up"
                      : "is down"}
                </span>{" "}
                <span className="font-semibold tabular-nums">{Math.abs(derived.trend.percentChange).toFixed(1)}%</span>{" "}
                <span className="text-foreground/60">{derived.trendLabel}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Not enough data to compute a trend for this range.</div>
            )}

            <div className="mt-3 rounded-xl border border-border/60 bg-background/20 p-3">
              {derived.forecast ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs font-semibold text-muted-foreground">Projected month-end spend</div>
                  <div className="text-base font-semibold tabular-nums">{formatCents(derived.forecast.projected)}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Month-end forecast is available when the range is set to this month.
                </div>
              )}
              {derived.forecast ? (
                <div className="mt-1 text-xs text-foreground/60">
                  Avg/day: {formatCents(derived.forecast.dailyAverage)} · {derived.forecast.confidence} confidence
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {transactionsQuery.isLoading ? (
          <Skeleton className="h-[260px]" />
        ) : transactionsQuery.isError || !transactionsQuery.data ? (
          <div className="rounded-2xl border border-border/60 bg-card/35 p-6">
            <div className="text-sm font-semibold">Couldn’t load recurring payments</div>
            <div className="mt-1 text-sm text-muted-foreground">Requires transaction data.</div>
          </div>
        ) : (
          <RecurringList transactions={transactionsQuery.data} />
        )}

        {transactionsQuery.isLoading ? (
          <Skeleton className="h-[260px]" />
        ) : transactionsQuery.isError || !transactionsQuery.data ? (
          <div className="rounded-2xl border border-border/60 bg-card/35 p-6">
            <div className="text-sm font-semibold">Couldn’t load anomalies</div>
            <div className="mt-1 text-sm text-muted-foreground">Requires transaction data.</div>
          </div>
        ) : (
          <AnomalyTable transactions={transactionsQuery.data} />
        )}
      </section>
    </div>
  );
}

