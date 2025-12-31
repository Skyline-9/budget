import React from "react";
import { endOfMonth, format, getDaysInMonth, startOfMonth } from "date-fns";
import { Calendar, Lightbulb, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DashboardCharts, DashboardSummary } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import { calculatePareto, calculateTrend, forecastMonthEnd } from "@/lib/analysis";

function Bullet({
  icon,
  children,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ring-1",
          "bg-background/40 ring-border/60 text-muted-foreground",
          tone === "positive" && "bg-income/10 ring-income/30 text-income",
          tone === "negative" && "bg-expense/10 ring-expense/30 text-expense",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 text-sm text-foreground/80">{children}</div>
    </div>
  );
}

function thisMonthRangeKey(now: Date) {
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function QuickInsights({
  summary,
  charts,
  from,
  to,
  className,
}: {
  summary: DashboardSummary;
  charts: DashboardCharts;
  from?: string;
  to?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const insights = React.useMemo(() => {
    const pareto = calculatePareto(charts.categoryBreakdown);

    const interval = charts.trendInterval;
    const expenseSeries = charts.monthlyTrend.map((p) => p.expenseCents);
    const window = interval === "day" ? 7 : 3;
    const recent = expenseSeries.slice(-window);
    const prior = expenseSeries.slice(-(window * 2), -window);
    const trend = calculateTrend(recent, prior);

    const now = new Date();
    const { from: tmFrom, to: tmTo } = thisMonthRangeKey(now);
    const isThisMonth = from === tmFrom && to === tmTo;
    const forecast = isThisMonth
      ? forecastMonthEnd(summary.expenseCents, now.getDate(), { daysInMonth: getDaysInMonth(now) })
      : null;

    return { pareto, trend, forecast, isThisMonth, interval, window };
  }, [charts.categoryBreakdown, charts.monthlyTrend, charts.trendInterval, from, summary.expenseCents, to]);

  const trendTone = insights.trend.direction === "up" ? "negative" : insights.trend.direction === "down" ? "positive" : "neutral";
  const trendIcon =
    insights.trend.direction === "up" ? (
      <TrendingUp className="h-4 w-4" />
    ) : insights.trend.direction === "down" ? (
      <TrendingDown className="h-4 w-4" />
    ) : (
      <TrendingUp className="h-4 w-4" />
    );

  const trendLabel = insights.interval === "day" ? `vs prior ${insights.window} days` : `vs prior ${insights.window} months`;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/35 p-5",
        "corner-glow tint-neutral",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:bg-card/45 hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-background/40 ring-1 ring-border/60 text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
        </span>
        <span>Quick insights</span>
      </div>

      <div className="mt-4 space-y-3">
        <Bullet icon={<Target className="h-4 w-4" />}>
          <span className="font-semibold tabular-nums">{insights.pareto.categoriesFor80Percent || "—"}</span>{" "}
          categories account for{" "}
          <span className="font-semibold tabular-nums">80%</span> of spending
        </Bullet>

        <Bullet icon={trendIcon} tone={trendTone}>
          Spending{" "}
          <span className="font-semibold">
            {insights.trend.direction === "stable" ? "is flat" : insights.trend.direction === "up" ? "is up" : "is down"}
          </span>{" "}
          <span className="font-semibold tabular-nums">{Math.abs(insights.trend.percentChange).toFixed(1)}%</span>{" "}
          <span className="text-foreground/60">{trendLabel}</span>
        </Bullet>

        <Bullet icon={<Calendar className="h-4 w-4" />} tone="neutral">
          {insights.forecast ? (
            <>
              Projected month-end:{" "}
              <span className="font-semibold tabular-nums">{formatCents(insights.forecast.projected)}</span>{" "}
              <span className="text-foreground/60">({insights.forecast.confidence} confidence)</span>
            </>
          ) : (
            <>
              Projected month-end: <span className="text-foreground/60">select “This month”</span>
            </>
          )}
        </Bullet>
      </div>

      <div className="mt-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={() => navigate({ pathname: "/insights", search: location.search })}
        >
          <span>View detailed insights</span>
          <span aria-hidden className="text-foreground/50">
            →
          </span>
        </Button>
      </div>
    </div>
  );
}

