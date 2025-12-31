import React from "react";
import ReactECharts from "echarts-for-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { TrendingUp, BarChart3, Calendar } from "lucide-react";
import type { DashboardCharts } from "@/types";
import { formatCents, formatDateDisplay, formatMonthKey, formatYmdToShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useTheme } from "@/providers/ThemeProvider";
import { ChartLegendList, type LegendItem } from "@/components/dashboard/ChartLegendList";
import cornerShineSvg from "@/assets/dashboard/corner-shine.svg";
import { getChartCategoricalPalette, getChartTableauPalette, getGlowRgbTriplet } from "@/theme/palette";

function ChartCard({
  title,
  children,
  className,
  glow,
  cornerShine,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  glow?: "neutral" | "income" | "expense" | "accent";
  cornerShine?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/60 bg-card/35 p-5 overflow-hidden",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:bg-card/45 hover:shadow-lift",
        glow && "corner-glow",
        glow === "neutral" && "tint-neutral",
        glow === "income" && "tint-income",
        glow === "expense" && "tint-expense",
        glow === "accent" && "tint-accent",
        className,
      )}
    >
      {cornerShine && (
        <img
          src={cornerShineSvg}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
          aria-hidden="true"
        />
      )}
      <div className="relative flex items-center gap-2 text-sm font-semibold tracking-tight">
        {icon && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-background/40 ring-1 ring-border/60 text-muted-foreground">
            {icon}
          </span>
        )}
        <span>{title}</span>
      </div>
      <div className="relative mt-3">{children}</div>
    </div>
  );
}

function compactNumber(n: number) {
  const nf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  return nf.format(n);
}

export function DashboardChartsView({ charts }: { charts: DashboardCharts }) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const chartCategoricalPalette = React.useMemo(() => getChartCategoricalPalette(), [theme]);
  const chartTableauPalette = React.useMemo(() => getChartTableauPalette(), [theme]);

  const incomeRgb = React.useMemo(() => getGlowRgbTriplet("income"), [theme]);
  const expenseRgb = React.useMemo(() => getGlowRgbTriplet("expense"), [theme]);
  const incomeColor = `rgb(${incomeRgb})`;
  const expenseColor = `rgb(${expenseRgb})`;
  const incomeArea = `rgba(${incomeRgb},0.10)`;
  const expenseArea = `rgba(${expenseRgb},0.10)`;

  const hasAnimatedOnceRef = React.useRef(false);
  const allowAnimation = !hasAnimatedOnceRef.current && !reduceMotion;
  React.useEffect(() => {
    hasAnimatedOnceRef.current = true;
  }, []);

  const baseText = React.useMemo(
    () => ({
      color: theme === "dark" ? "rgba(229,231,235,0.82)" : "rgba(15,23,42,0.78)",
    }),
    [theme],
  );

  const sharedFrom = sp.get("from") ?? undefined;
  const sharedTo = sp.get("to") ?? undefined;
  const sharedQ = sp.get("q") ?? undefined;
  const sharedMin = sp.get("min") ?? undefined;
  const sharedMax = sp.get("max") ?? undefined;

  const monthlyTrendOption = React.useMemo(() => {
    const isDaily = charts.trendInterval === "day";
    const periods = charts.monthlyTrend.map((p) => p.month);
    const income = charts.monthlyTrend.map((p) => p.incomeCents / 100);
    const expense = charts.monthlyTrend.map((p) => p.expenseCents / 100);
    const incomeTotalCents = charts.monthlyTrend.reduce((acc, p) => acc + p.incomeCents, 0);
    const expenseTotalCents = charts.monthlyTrend.reduce((acc, p) => acc + p.expenseCents, 0);
    const labelInterval = isDaily ? Math.max(0, Math.ceil(periods.length / 8) - 1) : 0;
    return {
      textStyle: baseText,
      animation: allowAnimation,
      animationDuration: allowAnimation ? 320 : 0,
      animationDurationUpdate: allowAnimation ? 220 : 0,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      // Ensure legend swatches match the series colors (ECharts otherwise uses its default palette).
      color: [incomeColor, expenseColor],
      grid: { left: 52, right: 18, top: 34, bottom: 32 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: any[]) => {
          const raw = params?.[0]?.axisValue ?? "";
          const axis = isDaily ? formatDateDisplay(raw) : formatMonthKey(raw);
          const incomeP = params.find((p) => p.seriesName === "Income");
          const expenseP = params.find((p) => p.seriesName === "Expenses");
          const incomeV = Number(incomeP?.data ?? 0);
          const expenseV = Number(expenseP?.data ?? 0);
          const netCents = Math.round((incomeV - expenseV) * 100);
          return `
            <div style="font-weight:700; margin-bottom:6px">${axis}</div>
            <div style="display:flex; justify-content:space-between; gap:12px">
              <span>Income</span><span style="font-variant-numeric: tabular-nums">${formatCents(
                Math.round(incomeV * 100),
              )}</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px">
              <span>Expenses</span><span style="font-variant-numeric: tabular-nums">${formatCents(
                Math.round(expenseV * 100),
              )}</span>
            </div>
            <div style="height:1px; background:rgba(148,163,184,0.22); margin:8px 0"></div>
            <div style="display:flex; justify-content:space-between; gap:12px">
              <span>Net</span><span style="font-weight:700; font-variant-numeric: tabular-nums">${formatCents(
                netCents,
              )}</span>
            </div>
          `;
        },
      },
      legend: {
        top: 0,
        textStyle: baseText,
        icon: "roundRect",
        itemWidth: 10,
        formatter: (name: string) => {
          if (name === "Income") return `Income · ${formatCents(incomeTotalCents)}`;
          if (name === "Expenses") return `Expenses · ${formatCents(expenseTotalCents)}`;
          return name;
        },
      },
      xAxis: {
        type: "category",
        data: periods,
        name: isDaily ? "Day" : "Month",
        nameTextStyle: { color: baseText.color, fontSize: 11, fontWeight: 600 },
        nameGap: 26,
        axisLabel: {
          color: baseText.color,
          interval: labelInterval,
          formatter: (v: string) => (isDaily ? formatYmdToShort(v) : formatMonthKey(v)),
        },
        axisLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.35)",
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Amount",
        nameTextStyle: { color: baseText.color, fontSize: 11, fontWeight: 600 },
        nameGap: 34,
        axisLabel: {
          color: baseText.color,
          formatter: (v: number) => `$${compactNumber(v)}`,
        },
        splitLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(148,163,184,0.14)" : "rgba(100,116,139,0.20)",
          },
        },
      },
      series: [
        {
          name: "Income",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: incomeColor },
          areaStyle: { color: incomeArea },
          data: income,
        },
        {
          name: "Expenses",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: expenseColor },
          areaStyle: { color: expenseArea },
          data: expense,
        },
      ],
    };
  }, [allowAnimation, baseText, charts.monthlyTrend, charts.trendInterval, expenseArea, expenseColor, incomeArea, incomeColor, theme]);

  const categoryBreakdownOption = React.useMemo(() => {
    const names = charts.categoryBreakdown.map((c) => c.categoryName).reverse();
    const seriesData = charts.categoryBreakdown
      .map((c) => ({
        name: c.categoryName,
        value: c.totalCents / 100,
        categoryId: c.categoryId,
      }))
      .reverse();
    return {
      textStyle: baseText,
      animation: allowAnimation,
      animationDuration: allowAnimation ? 320 : 0,
      animationDurationUpdate: allowAnimation ? 220 : 0,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      grid: { left: 170, right: 18, top: 24, bottom: 28 },
      tooltip: {
        trigger: "item",
        formatter: (p: any) => `${p.name}<br/>${formatCents(Math.round(p.value * 100))}`,
      },
      xAxis: {
        type: "value",
        name: "Amount",
        nameTextStyle: { color: baseText.color, fontSize: 11, fontWeight: 600 },
        nameGap: 26,
        axisLabel: { color: baseText.color, formatter: (v: number) => `$${compactNumber(v)}` },
        splitLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(148,163,184,0.14)" : "rgba(100,116,139,0.20)",
          },
        },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLabel: { color: baseText.color },
        axisLine: {
          lineStyle: {
            color: theme === "dark" ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.35)",
          },
        },
      },
      series: [
        {
          type: "bar",
          data: seriesData,
          barWidth: 16,
          itemStyle: {
            borderRadius: [10, 10, 10, 10],
            color: (params: any) => {
              return chartCategoricalPalette[params.dataIndex % chartCategoricalPalette.length];
            },
          },
        },
      ],
    };
  }, [allowAnimation, baseText, chartCategoricalPalette, charts.categoryBreakdown, theme]);

  const categoryMonthlyOption = React.useMemo(() => {
    const months = charts.categoryMonthly.months;
    const series = charts.categoryMonthly.series;

    const isDark = theme === "dark";
    const palette = chartTableauPalette;

    const startValue = months.length > 6 ? months[Math.max(0, months.length - 6)] : months[0];
    const endValue = months[months.length - 1];

    const segmentStroke = isDark ? "rgba(2,6,23,0.70)" : "rgba(248,250,252,0.92)";
    const hoverStroke = isDark ? "rgba(226,232,240,0.65)" : "rgba(15,23,42,0.25)";
    const axisLineColor = isDark ? "rgba(148,163,184,0.20)" : "rgba(100,116,139,0.28)";
    const gridLineColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.16)";

    const tooltipBg = isDark ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.97)";
    const tooltipBorder = isDark ? "rgba(148,163,184,0.20)" : "rgba(15,23,42,0.10)";
    const tooltipText = isDark ? "rgba(226,232,240,0.92)" : "rgba(15,23,42,0.88)";
    const tooltipShadow = isDark ? "0 16px 44px rgba(0,0,0,0.45)" : "0 14px 36px rgba(2,6,23,0.18)";

    const sliderTrack = isDark ? "rgba(148,163,184,0.06)" : "rgba(15,23,42,0.05)";
    const sliderFill = isDark ? "rgba(148,163,184,0.14)" : "rgba(100,116,139,0.14)";
    const sliderHandle = isDark ? "rgba(226,232,240,0.75)" : "rgba(15,23,42,0.35)";
    const sliderHandleBorder = isDark ? "rgba(148,163,184,0.32)" : "rgba(100,116,139,0.28)";

    const seriesOptions = series.map((s, idx) => ({
      id: s.categoryId,
      name: s.categoryName,
      type: "bar",
      stack: "expenses",
      // Use a ratio instead of fixed pixels so the bars naturally widen as you zoom into fewer months.
      barWidth: "80%",
      // Hover should only emphasize the hovered bar segment (month), not this category across all months.
      itemStyle: {
        borderRadius: 0,
        color: palette[idx % palette.length],
        borderWidth: 1,
        borderColor: segmentStroke,
        opacity: 0.98,
      },
      emphasis: {
        itemStyle: {
          opacity: 1,
          borderWidth: 2,
          borderColor: hoverStroke,
        },
      },
      data: s.valuesCents.map((c) => c / 100),
    }));

    return {
      textStyle: baseText,
      grid: { left: 56, right: 18, top: 18, bottom: 62 },
      animation: allowAnimation,
      animationDuration: allowAnimation ? 350 : 0,
      animationDurationUpdate: allowAnimation ? 240 : 0,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      tooltip: {
        trigger: "item",
        appendToBody: true,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: [10, 12],
        extraCssText: `border-radius:12px; box-shadow:${tooltipShadow};`,
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (p: any) => {
          const raw = (p?.name as string | undefined) ?? (p?.axisValue as string | undefined) ?? "";
          const axis = raw ? formatMonthKey(raw) : "";
          const category = (p?.seriesName as string | undefined) ?? "";
          const value = Number(p?.value ?? p?.data ?? 0);
          const valueCents = Math.round(value * 100);
          const swatchColor = (p?.color as string | undefined) ?? "rgba(148,163,184,0.9)";
          const swatchBorder = isDark ? "rgba(2,6,23,0.75)" : "rgba(15,23,42,0.12)";

          return `
            <div style="font-weight:700; margin-bottom:6px">${axis}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
              <span style="display:flex; align-items:center; gap:8px">
                <span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${swatchColor}; box-shadow:0 0 0 1px ${swatchBorder};"></span>
                <span>${category}</span>
              </span>
              <span style="font-weight:700; font-variant-numeric: tabular-nums">${formatCents(valueCents)}</span>
            </div>
          `;
        },
      },
      legend: {
        show: false,
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 18,
          bottom: 8,
          showDetail: false,
          backgroundColor: sliderTrack,
          borderColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.20)",
          fillerColor: sliderFill,
          handleStyle: { color: sliderHandle, borderColor: sliderHandleBorder },
          handleSize: 10,
          startValue,
          endValue,
        },
      ],
      xAxis: {
        type: "category",
        data: months,
        name: "Month",
        nameTextStyle: { color: baseText.color, fontSize: 11, fontWeight: 600 },
        nameGap: 28,
        axisLabel: {
          color: baseText.color,
          margin: 12,
          formatter: (v: string) => formatMonthKey(v),
        },
        axisTick: { show: false },
        axisLine: {
          lineStyle: {
            color: axisLineColor,
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Spend",
        nameTextStyle: { color: baseText.color, fontSize: 11, fontWeight: 600 },
        nameGap: 34,
        axisLabel: {
          color: baseText.color,
          margin: 12,
          formatter: (v: number) => `$${compactNumber(v)}`,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: {
          lineStyle: {
            color: gridLineColor,
            type: "dashed",
          },
        },
      },
      series: seriesOptions,
    };
  }, [allowAnimation, baseText, chartTableauPalette, charts.categoryMonthly, theme]);

  const categoryRankItems = React.useMemo(() => {
    const sorted = [...charts.categoryShare].sort((a, b) => b.totalCents - a.totalCents);
    const total = sorted.reduce((acc, c) => acc + c.totalCents, 0) || 1;

    // Keep categorical palette separate from the primary UI accent.
    const palette = chartCategoricalPalette.slice(0, 6);

    const items: LegendItem[] = sorted.map((c, idx) => ({
      name: c.categoryName,
      valueCents: c.totalCents,
      percent: c.totalCents / total,
      color: palette[idx % palette.length]!,
      categoryId: c.categoryId,
    }));

    return items;
  }, [chartCategoricalPalette, charts.categoryShare]);

  const onCategoryClick = React.useCallback(
    (categoryId: string) => {
      const next = new URLSearchParams();
      if (sharedFrom) next.set("from", sharedFrom);
      if (sharedTo) next.set("to", sharedTo);
      if (sharedQ) next.set("q", sharedQ);
      if (sharedMin) next.set("min", sharedMin);
      if (sharedMax) next.set("max", sharedMax);
      next.set("categoryId", categoryId);
      navigate({ pathname: "/transactions", search: next.toString() });
    },
    [navigate, sharedFrom, sharedMax, sharedMin, sharedQ, sharedTo],
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <ChartCard
        title={
          charts.trendInterval === "day"
            ? "Daily trend (income vs expenses)"
            : "Monthly trend (income vs expenses)"
        }
        className="xl:col-span-2"
        glow="neutral"
        cornerShine={charts.trendInterval === "day"}
        icon={<TrendingUp className="h-4 w-4" />}
      >
        <ReactECharts
          option={monthlyTrendOption}
          style={{ height: 320 }}
          opts={{ renderer: "canvas" }}
        />
      </ChartCard>

      <ChartCard title="Category ranking (expenses)" glow="neutral" icon={<BarChart3 className="h-4 w-4" />}>
        <div className="flex h-[320px] min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border/60 px-3 pb-2 text-xs font-semibold text-muted-foreground">
            <span>Category</span>
            <span className="tabular-nums">Spend</span>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
            <ChartLegendList items={categoryRankItems} onSelectCategory={onCategoryClick} />
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Top categories (expenses) by month" className="xl:col-span-3" cornerShine icon={<Calendar className="h-4 w-4" />}>
        <ReactECharts
          option={categoryMonthlyOption}
          style={{ height: 380 }}
          opts={{ renderer: "canvas" }}
          onEvents={{
            click: (params: any) => {
              const cid =
                (params?.seriesId as string | undefined) ??
                (params?.data?.categoryId as string | undefined);
              if (cid) onCategoryClick(cid);
            },
          }}
        />
      </ChartCard>
    </div>
  );
}

export default DashboardChartsView;
