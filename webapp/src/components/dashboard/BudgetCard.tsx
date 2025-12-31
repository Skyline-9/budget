import React from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import { BudgetDialog } from "@/components/dashboard/BudgetDialog";
import dividerWaveUrl from "@/assets/dashboard/divider-wave.svg";
import dotsOverlayUrl from "@/assets/dashboard/dots-overlay.svg";

function pctText(v01: number) {
  const nf = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });
  return nf.format(v01);
}

export function BudgetCard(props: {
  subtitle: string;
  editMonth: string; // YYYY-MM (month to edit in dialog)
  expenseCents: number; // absolute (positive)
  adjustedBudgetCents: number | null | undefined;
  editMonthBudgetCents?: number | null;
  missingMonthsCount?: number;
  isLoading?: boolean;
  isError?: boolean;
  className?: string;
}) {
  const {
    subtitle,
    editMonth,
    expenseCents,
    adjustedBudgetCents,
    editMonthBudgetCents,
    missingMonthsCount,
    isLoading,
    isError,
    className,
  } = props;
  const [open, setOpen] = React.useState(false);

  const budgetCents = adjustedBudgetCents ?? undefined;
  const remainingCents = budgetCents != null ? budgetCents - expenseCents : undefined;
  const ratio =
    budgetCents != null
      ? budgetCents > 0
        ? expenseCents / budgetCents
        : expenseCents > 0
          ? 1
          : 0
      : 0;
  const fill01 = Math.max(0, Math.min(1, ratio));
  const overspent = budgetCents != null && expenseCents > budgetCents;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/35",
        "p-6 md:p-7 corner-glow-hero tint-hero",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5",
        "hover:bg-card/45 hover:shadow-lift",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.22] dark:opacity-[0.18]">
        <img src={dotsOverlayUrl} alt="" className="h-full w-full object-cover" />
      </div>
      <div aria-hidden className="pointer-events-none absolute bottom-10 left-0 right-0 opacity-80 dark:opacity-70">
        <img src={dividerWaveUrl} alt="" className="w-full" />
      </div>

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-hero/10 ring-1 ring-hero/30 text-hero">
              <Target className="h-4 w-4" />
            </span>
            <span>Budget (Adjusted)</span>
          </div>
          <div className="mt-1 text-xs text-foreground/60">{subtitle}</div>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {budgetCents != null ? "Edit" : "Set"}
        </Button>
      </div>

      {isLoading ? (
        <div className="relative z-10 mt-4 space-y-3">
          <Skeleton className="h-5 w-[160px]" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-[220px]" />
        </div>
      ) : isError ? (
        <div className="relative z-10 mt-4 text-sm text-warning">Couldn’t load budget.</div>
      ) : budgetCents == null ? (
        <div className="relative z-10 mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs text-foreground/60">Spent</div>
            <div className="text-base font-semibold tabular-nums">{formatCents(expenseCents)}</div>
          </div>
          <div className="mt-3 text-xs text-foreground/50">
            No budget set for this range. Set monthly budgets to compute an adjusted budget.
          </div>
        </div>
      ) : (
        <div className="relative z-10 mt-4 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-tight text-foreground/70">
                {overspent ? "Over budget" : "Remaining"}
              </div>
              <div
                className={cn(
                  "mt-1 text-4xl font-semibold tracking-tight tabular-nums",
                  overspent ? "text-warning" : "text-hero",
                )}
              >
                {formatCents(remainingCents ?? 0)}
              </div>
            </div>
            <div className="text-xs text-foreground/60">{budgetCents > 0 ? `${pctText(ratio)} used` : "—"}</div>
          </div>

          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full border border-border/60 bg-background/40">
              <div
                className={cn("h-full rounded-full", overspent ? "bg-warning" : "bg-hero")}
                style={{ width: `${Math.round(fill01 * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-foreground/60">
              <span className="tabular-nums">
                Spent {formatCents(expenseCents)} / Budget {formatCents(budgetCents)}
              </span>
              {missingMonthsCount ? (
                <span className="text-foreground/50">Missing {missingMonthsCount} month(s)</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <BudgetDialog
        open={open}
        onOpenChange={setOpen}
        month={editMonth}
        initialBudgetCents={editMonthBudgetCents ?? null}
      />
    </div>
  );
}
