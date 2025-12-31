import React from "react";
import { AlertTriangle } from "lucide-react";
import type { Transaction } from "@/types";
import { cn } from "@/lib/cn";
import { detectAnomalies } from "@/lib/analysis";
import { formatCents, formatDateDisplay } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export function AnomalyTable({
  transactions,
  threshold = 2.5,
  maxRows = 12,
  className,
}: {
  transactions: Transaction[];
  threshold?: number;
  maxRows?: number;
  className?: string;
}) {
  const rows = React.useMemo(() => {
    const expenses = transactions.filter((t) => t.amountCents < 0);
    if (!expenses.length) return [];

    const absAmounts = expenses.map((t) => Math.abs(t.amountCents));
    const scored = detectAnomalies(absAmounts, threshold);

    const combined = expenses
      .map((t, idx) => ({
        t,
        amountCents: absAmounts[idx] ?? 0,
        zScore: scored[idx]?.zScore ?? 0,
        isAnomaly: scored[idx]?.isAnomaly ?? false,
      }))
      .filter((r) => r.isAnomaly)
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
      .slice(0, Math.max(1, maxRows));

    return combined;
  }, [maxRows, threshold, transactions]);

  return (
    <Card title="Unusual transactions" icon={<AlertTriangle className="h-4 w-4" />} className={className}>
      {rows.length ? (
        <>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-background/20">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="w-[140px] text-right">Amount</TableHead>
                  <TableHead className="w-[110px] text-right">Z</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const merchant = (r.t.merchant ?? "").trim() || "Unknown";
                  const zAbs = Math.abs(r.zScore);
                  const badgeVariant = zAbs >= 3.5 ? "danger" : zAbs >= 3 ? "expense" : "subtle";
                  return (
                    <TableRow key={r.t.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDateDisplay(r.t.date)}</TableCell>
                      <TableCell className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{merchant}</span>
                          <Badge variant={badgeVariant}>{zAbs >= 3.5 ? "Very unusual" : zAbs >= 3 ? "Unusual" : "Odd"}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(r.amountCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.zScore.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Z-scores are computed on expense amounts in the selected range (threshold: {threshold}).
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
          No unusual expenses detected for this range.
        </div>
      )}
    </Card>
  );
}

