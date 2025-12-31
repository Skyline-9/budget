import React from "react";
import ReactECharts from "echarts-for-react";
import { CalendarDays } from "lucide-react";
import { getDay, isValid, parseISO } from "date-fns";
import type { Transaction } from "@/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import { useTheme } from "@/providers/ThemeProvider";
import { getGlowRgbTriplet } from "@/theme/palette";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEK_LABELS = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"] as const;

function ChartCard({
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
        "group relative rounded-2xl border border-border/60 bg-card/35 p-5 overflow-hidden",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:bg-card/45 hover:shadow-lift",
        "corner-glow tint-neutral",
        className,
      )}
    >
      <div className="relative flex items-center gap-2 text-sm font-semibold tracking-tight">
        {icon ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-background/40 ring-1 ring-border/60 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span>{title}</span>
      </div>
      <div className="relative mt-3">{children}</div>
    </div>
  );
}

export function SpendingHeatmap({
  transactions,
  className,
}: {
  transactions: Transaction[];
  className?: string;
}) {
  const { theme } = useTheme();

  const computed = React.useMemo(() => {
    // Matrix: rows = week-of-month (1..5), cols = day-of-week (0..6)
    const grid = Array.from({ length: 5 }, () => Array.from({ length: 7 }, () => 0));
    let totalSpendCents = 0;

    for (const t of transactions) {
      if (t.amountCents >= 0) continue;
      const d = parseISO(t.date);
      if (!isValid(d)) continue;
      const dow = getDay(d);
      const weekOfMonth = Math.min(5, Math.floor((d.getDate() - 1) / 7) + 1);
      const cents = -t.amountCents;
      grid[weekOfMonth - 1]![dow]! += cents;
      totalSpendCents += cents;
    }

    const data: Array<[number, number, number]> = [];
    let maxCents = 0;
    for (let w = 0; w < 5; w++) {
      for (let d = 0; d < 7; d++) {
        const v = grid[w]![d]!;
        if (v > maxCents) maxCents = v;
        data.push([d, w, v]);
      }
    }

    return { data, maxCents, totalSpendCents };
  }, [transactions]);

  if (computed.totalSpendCents <= 0) {
    return (
      <ChartCard title="Spending heatmap" icon={<CalendarDays className="h-4 w-4" />} className={className}>
        <div className="rounded-xl border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
          No expenses in this range yet.
        </div>
      </ChartCard>
    );
  }

  const glowRgb = getGlowRgbTriplet("accent");
  const heatLow = theme === "dark" ? `rgba(${glowRgb},0.10)` : `rgba(${glowRgb},0.14)`;
  const heatHigh = theme === "dark" ? `rgba(${glowRgb},0.92)` : `rgba(${glowRgb},0.82)`;

  const baseText = {
    color: theme === "dark" ? "rgba(229,231,235,0.82)" : "rgba(15,23,42,0.78)",
  };

  const axisLineColor = theme === "dark" ? "rgba(148,163,184,0.20)" : "rgba(100,116,139,0.28)";
  const gridLineColor = theme === "dark" ? "rgba(148,163,184,0.10)" : "rgba(100,116,139,0.16)";

  const option = {
    textStyle: baseText,
    grid: { left: 56, right: 18, top: 8, bottom: 14 },
    tooltip: {
      trigger: "item",
      formatter: (p: any) => {
        const x = Number(p?.value?.[0] ?? 0);
        const y = Number(p?.value?.[1] ?? 0);
        const cents = Number(p?.value?.[2] ?? 0);
        const day = DAY_NAMES[x] ?? "";
        const week = WEEK_LABELS[y] ?? "";
        return `
          <div style="font-weight:700; margin-bottom:6px">${week} · ${day}</div>
          <div style="display:flex; justify-content:space-between; gap:12px">
            <span>Spend</span><span style="font-variant-numeric: tabular-nums">${formatCents(cents)}</span>
          </div>
        `;
      },
    },
    xAxis: {
      type: "category",
      data: DAY_NAMES,
      axisLabel: { color: baseText.color },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: gridLineColor } },
    },
    yAxis: {
      type: "category",
      data: WEEK_LABELS,
      axisLabel: { color: baseText.color },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: gridLineColor } },
    },
    visualMap: {
      min: 0,
      max: Math.max(1, computed.maxCents),
      show: false,
      inRange: {
        color: [heatLow, heatHigh],
      },
    },
    series: [
      {
        type: "heatmap",
        data: computed.data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: theme === "dark" ? "rgba(0,0,0,0.35)" : "rgba(2,6,23,0.18)",
          },
        },
      },
    ],
  };

  return (
    <ChartCard title="Spending heatmap" icon={<CalendarDays className="h-4 w-4" />} className={className}>
      <ReactECharts option={option} style={{ height: 260 }} opts={{ renderer: "canvas" }} />
      <div className="mt-2 text-xs text-muted-foreground">
        Heatmap shows total spend (expenses) by day-of-week and week-of-month for the selected range.
      </div>
    </ChartCard>
  );
}

