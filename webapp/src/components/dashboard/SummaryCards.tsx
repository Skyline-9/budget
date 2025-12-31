import { ArrowDownRight, ArrowUpRight, Minus, PiggyBank } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatCents, formatPercent01 } from "@/lib/format";
import type { DashboardSummary } from "@/types";

function Card({
  title,
  value,
  sub,
  icon,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone?: "income" | "expense" | "neutral";
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
        <div
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-background/40",
            tone === "income" && "border-income/30 bg-income/10 text-income",
            tone === "expense" && "border-expense/30 bg-expense/10 text-expense",
          )}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SummaryCards({
  summary,
  label = "This month",
}: {
  summary: DashboardSummary;
  label?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card
        title="Income"
        value={formatCents(summary.incomeCents)}
        sub={label}
        icon={<ArrowUpRight className="h-4 w-4" />}
        tone="income"
      />
      <Card
        title="Expenses"
        value={formatCents(summary.expenseCents)}
        sub={label}
        icon={<ArrowDownRight className="h-4 w-4" />}
        tone="expense"
      />
      <Card
        title="Net"
        value={formatCents(summary.netCents)}
        sub="Income – Expenses"
        icon={<Minus className="h-4 w-4" />}
        tone={summary.netCents >= 0 ? "income" : "expense"}
      />
      <Card
        title="Savings rate"
        value={formatPercent01(summary.savingsRate)}
        sub="Net / Income"
        icon={<PiggyBank className="h-4 w-4" />}
        tone="neutral"
      />
    </div>
  );
}

