import React from "react";
import { useSearchParams } from "react-router-dom";
import { useCategoriesQuery, useTransactionsQuery } from "@/api/queries";
import type { Transaction } from "@/types";
import { QuickAddTransaction } from "@/components/transactions/QuickAddTransaction";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { TransactionDialog } from "@/components/transactions/TransactionDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { readString, readStringList, parseMoneyToCents } from "@/lib/urlState";
import { getDescendantIds } from "@/lib/categoryHierarchy";

export function TransactionsPage() {
  const [sp] = useSearchParams();
  const from = readString(sp, "from");
  const to = readString(sp, "to");
  const q = readString(sp, "q");
  const categoryId = readStringList(sp, "categoryId") ?? [];
  const minAmountCents = parseMoneyToCents(readString(sp, "min"));
  const maxAmountCents = parseMoneyToCents(readString(sp, "max"));
  const isFiltered = Boolean(
    from ||
      to ||
      q ||
      categoryId.length ||
      minAmountCents !== undefined ||
      maxAmountCents !== undefined,
  );

  const categoriesQuery = useCategoriesQuery();
  const effectiveCategoryId = React.useMemo(() => {
    if (!categoryId.length) return undefined;
    const categories = categoriesQuery.data ?? [];
    if (!categories.length) return categoryId;
    const out = new Set<string>();
    for (const id of categoryId) {
      out.add(id);
      const descendants = getDescendantIds(categories, id);
      for (const d of descendants) out.add(d);
    }
    return Array.from(out);
  }, [categoryId, categoriesQuery.data]);

  const txnsQuery = useTransactionsQuery({
    from,
    to,
    q,
    categoryId: effectiveCategoryId,
    minAmountCents,
    maxAmountCents,
  });

  const [editing, setEditing] = React.useState<Transaction | undefined>(undefined);
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">Fast entry, fast review</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Cmd/Ctrl+K or / to search • N to open the add dialog
        </div>
      </div>

      <QuickAddTransaction />

      {categoriesQuery.isLoading || txnsQuery.isLoading ? (
        <div className="rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg">
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-[560px] w-full" />
          </div>
        </div>
      ) : categoriesQuery.isError || txnsQuery.isError ? (
        <div className="rounded-3xl border border-border/60 bg-card/50 p-6 shadow-soft-lg">
          <div className="text-sm font-semibold">Couldn’t load transactions</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Try again, or switch API mode back to mock.
          </div>
        </div>
      ) : (
        <TransactionsTable
          transactions={txnsQuery.data ?? []}
          categories={categoriesQuery.data ?? []}
          isFiltered={isFiltered}
          onRowClick={(t) => {
            setEditing(t);
            setEditOpen(true);
          }}
        />
      )}

      <TransactionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={editing}
      />
    </div>
  );
}

