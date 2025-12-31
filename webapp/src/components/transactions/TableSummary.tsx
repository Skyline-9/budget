import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Transaction } from "@/types";
import { AnimatedMoneyCents } from "@/components/motion/AnimatedNumber";

export function TableSummary({ transactions }: { transactions: Transaction[] }) {
  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    let net = 0;
    for (const t of transactions) {
      net += t.amountCents;
      if (t.amountCents >= 0) income += t.amountCents;
      else expense += Math.abs(t.amountCents);
    }
    return { income, expense, net };
  }, [transactions]);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <ArrowDownRight className="h-3.5 w-3.5" />
        Expenses: <AnimatedMoneyCents cents={totals.expense} />
      </span>
      <span className="text-muted-foreground/60">•</span>
      <span className="flex items-center gap-1.5">
        <ArrowUpRight className="h-3.5 w-3.5" />
        Income: <AnimatedMoneyCents cents={totals.income} />
      </span>
      <span className="text-muted-foreground/60">•</span>
      <span className="flex items-center gap-1.5 text-foreground/90">
        <Minus className="h-3.5 w-3.5" />
        Net: <AnimatedMoneyCents cents={totals.net} />
      </span>
    </div>
  );
}
