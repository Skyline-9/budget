import React from "react";
import { Repeat } from "lucide-react";
import type { Transaction } from "@/types";
import { cn } from "@/lib/cn";
import { findRecurringTransactions } from "@/lib/analysis";
import { formatCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

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

export function RecurringList({
  transactions,
  maxRows = 10,
  className,
}: {
  transactions: Transaction[];
  maxRows?: number;
  className?: string;
}) {
  const recurring = React.useMemo(() => {
    return findRecurringTransactions(transactions).slice(0, Math.max(1, maxRows));
  }, [maxRows, transactions]);

  return (
    <Card title="Recurring payments" icon={<Repeat className="h-4 w-4" />} className={className}>
      {recurring.length ? (
        <div className="space-y-2">
          {recurring.map((r) => {
            const cadence =
              r.avgIntervalDays != null ? `~${r.avgIntervalDays}d cadence` : "Cadence unknown";
            return (
              <div
                key={`${r.merchant}:${r.avgAmountCents}:${r.count}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/20 p-3"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-semibold">{r.merchant}</div>
                    {r.isLikelySubscription ? (
                      <Badge variant="success">Likely subscription</Badge>
                    ) : (
                      <Badge variant="subtle">Recurring</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.count} transactions · avg {formatCents(r.avgAmountCents)} · {cadence}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums">{formatCents(r.avgAmountCents)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
          No recurring expense patterns detected yet.
        </div>
      )}
    </Card>
  );
}

