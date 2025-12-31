import React from "react";
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Receipt,
  Inbox,
  FilterX,
  Filter,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCategoriesQuery } from "@/api/queries";
import type { Category, Transaction } from "@/types";
import { AnimatedMoneyCents } from "@/components/motion/AnimatedNumber";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { buildCategoryTreeRows } from "@/lib/categoryHierarchy";
import { formatDateDisplay } from "@/lib/format";
import { readString, readStringList, writeListOrDelete, writeOrDelete } from "@/lib/urlState";
import { ActiveFilterChips } from "@/components/transactions/ActiveFilterChips";
import { TableRowActions } from "@/components/transactions/TableRowActions";
import { TableSummary } from "@/components/transactions/TableSummary";
import { useTransactionUiEvents } from "@/lib/transactionUiEvents";

type Props = {
  transactions: Transaction[];
  categories: Category[];
  onRowClick?: (t: Transaction) => void;
  isFiltered?: boolean;
};

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUp className="h-4 w-4" />;
  if (dir === "desc") return <ArrowDown className="h-4 w-4" />;
  return <ArrowUpDown className="h-4 w-4 opacity-50" />;
}

function headerClassFor(columnId: string) {
  switch (columnId) {
    case "date":
      return "w-[140px]";
    case "category":
      return "w-[240px]";
    case "merchant":
      return "w-[240px]";
    case "amount":
      return "w-[140px] text-right";
    case "actions":
      return "w-[64px] text-right";
    default:
      return "";
  }
}

function cellClassFor(columnId: string) {
  switch (columnId) {
    case "date":
      return "w-[140px] whitespace-nowrap tabular-nums";
    case "category":
      return "w-[240px]";
    case "merchant":
      return "w-[240px]";
    case "notes":
      return "min-w-[280px]";
    case "amount":
      return "w-[140px] text-right tabular-nums";
    case "actions":
      return "w-[64px] text-right";
    default:
      return "";
  }
}

export function TransactionsTable({ transactions, categories, onRowClick, isFiltered }: Props) {
  const [sp, setSp] = useSearchParams();
  const categoriesQuery = useCategoriesQuery();
  const allCategories = categoriesQuery.data ?? [];
  const activeCategories = allCategories.filter((c) => c.active);
  const categoriesById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const allCategoriesById = React.useMemo(() => new Map(allCategories.map((c) => [c.id, c])), [allCategories]);
  const reduceMotion = useReducedMotion();

  // Filter state
  const categoryId = readStringList(sp, "categoryId") ?? [];
  const min = readString(sp, "min");
  const max = readString(sp, "max");
  const selectedSet = new Set(categoryId);
  const categoryRows = React.useMemo(() => buildCategoryTreeRows(activeCategories), [activeCategories]);
  const hasAnyFilters = categoryId.length > 0 || Boolean(min) || Boolean(max);

  const setFilterPatch = React.useCallback(
    (patch: Partial<{ categoryId: string[] | undefined; min: string | undefined; max: string | undefined }>) => {
      const next = new URLSearchParams(sp);
      if ("min" in patch) writeOrDelete(next, "min", patch.min);
      if ("max" in patch) writeOrDelete(next, "max", patch.max);
      if ("categoryId" in patch) writeListOrDelete(next, "categoryId", patch.categoryId);
      setSp(next, { replace: true });
    },
    [setSp, sp],
  );

  const indentClass = React.useCallback((depth: number) => {
    const pl = ["pl-8", "pl-12", "pl-16", "pl-20", "pl-24", "pl-28"];
    return pl[Math.min(depth, pl.length - 1)]!;
  }, []);

  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<{ id: string; kind: "created" | "updated" } | null>(null);

  useTransactionUiEvents((ev) => {
    if (ev.type === "created") {
      setCreatedId(ev.transaction.id);
      setFlash({ id: ev.transaction.id, kind: "created" });
      return;
    }
    if (ev.type === "updated") {
      setFlash({ id: ev.transaction.id, kind: "updated" });
    }
  });

  React.useEffect(() => {
    if (!createdId) return;
    // If the newly-created txn isn't visible (filters/pagination), don't animate it.
    // Give it a short window to appear after the query refetch.
    const t = window.setTimeout(() => setCreatedId(null), 10_000);
    return () => window.clearTimeout(t);
  }, [createdId]);

  React.useEffect(() => {
    if (!createdId) return;
    const isPresent = transactions.some((t) => t.id === createdId);
    if (!isPresent) return;
    const t = window.setTimeout(() => setCreatedId(null), 1200);
    return () => window.clearTimeout(t);
  }, [createdId, transactions]);

  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [flash?.id, flash?.kind]);

  const columns = React.useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "date",
        accessorKey: "date",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date
            <SortIcon dir={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm font-medium" title={row.original.date}>
            {formatDateDisplay(row.original.date)}
          </div>
        ),
        sortingFn: (a, b) => a.original.date.localeCompare(b.original.date),
      },
      {
        id: "category",
        accessorFn: (t) => categoriesById.get(t.categoryId)?.name ?? t.categoryId,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Category
            <SortIcon dir={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => {
          const c = categoriesById.get(row.original.categoryId);
          const arrow = c?.kind === "income" ? "↗" : c?.kind === "expense" ? "↘" : "•";
          const label = c?.name ?? "Unknown";
          return (
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-xl border border-border/60 bg-background/35 text-xs text-muted-foreground"
                aria-hidden="true"
              >
                {arrow}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight">{label}</div>
                {!c ? (
                  <div className="truncate text-xs text-muted-foreground">{row.original.categoryId}</div>
                ) : !c.active ? (
                  <div className="mt-0.5">
                    <Badge variant="subtle">Inactive</Badge>
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
        sortingFn: (a, b) => {
          const an = categoriesById.get(a.original.categoryId)?.name ?? a.original.categoryId;
          const bn = categoriesById.get(b.original.categoryId)?.name ?? b.original.categoryId;
          return an.localeCompare(bn);
        },
      },
      {
        id: "merchant",
        accessorFn: (t) => t.merchant ?? "",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Merchant
            <SortIcon dir={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className={cn("truncate text-sm", !row.original.merchant && "text-muted-foreground")}>
            {row.original.merchant ?? "—"}
          </div>
        ),
      },
      {
        id: "notes",
        accessorFn: (t) => t.notes ?? "",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 -ml-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Notes
            <SortIcon dir={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className={cn("truncate text-sm", !row.original.notes && "text-muted-foreground")}>
            {row.original.notes ?? "—"}
          </div>
        ),
      },
      {
        id: "amount",
        accessorKey: "amountCents",
        header: ({ column }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 -mr-2"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Amount
              <SortIcon dir={column.getIsSorted()} />
            </Button>
          </div>
        ),
        cell: ({ row }) => {
          const cents = row.original.amountCents;
          return (
            <div className="text-sm font-semibold">
              <AnimatedMoneyCents cents={cents} />
            </div>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <div className="text-right"> </div>,
        cell: ({ row }) => (
          <TableRowActions transaction={row.original} onEdit={() => onRowClick?.(row.original)} />
        ),
      },
    ],
    [categoriesById],
  );

  const [sorting, setSorting] = React.useState<SortingState>(() => [{ id: "date", desc: true }]);
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({ pageIndex: 0, pageSize: 50 }));

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (t) => t.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalRows = table.getSortedRowModel().rows.length;

  // UX: when dataset changes (filters), snap back to first page.
  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [transactions]);

  const pageCount = table.getPageCount();
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();

  const start = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows);

  const rows = table.getRowModel().rows;
  const colCount = table.getAllLeafColumns().length;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 shadow-soft-lg corner-glow tint-neutral">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Transactions
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {totalRows.toLocaleString()} result{totalRows === 1 ? "" : "s"}
            </div>
          </div>
          <TableSummary transactions={transactions} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <Filter className="h-4 w-4" />
                Category
                {categoryId.length ? (
                  <span className="ml-1 rounded-full bg-background/40 px-2 py-0.5 text-xs ring-1 ring-border/60">
                    {categoryId.length}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Categories</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {categoryRows.map((row) => {
                const c = row.category;
                const isChild = row.depth > 0;
                return (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={selectedSet.has(c.id)}
                    className={cn("min-w-0", indentClass(row.depth), row.hasChildren && "font-semibold")}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedSet);
                      if (checked) next.add(c.id);
                      else next.delete(c.id);
                      setFilterPatch({ categoryId: Array.from(next) });
                    }}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {c.kind === "income" ? "↗" : "↘"}
                    </span>
                    {isChild ? <span className="ml-1 shrink-0 text-muted-foreground">↳</span> : null}
                    <span className="ml-2 min-w-0 flex-1 truncate">{c.name}</span>
                  </DropdownMenuCheckboxItem>
                );
              })}
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setFilterPatch({ categoryId: undefined })}
              >
                Clear categories
              </Button>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                $
              </span>
              <Input
                className="w-[120px] pl-5 text-right"
                placeholder="Min"
                value={min ?? ""}
                onChange={(e) => setFilterPatch({ min: e.target.value || undefined })}
              />
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                $
              </span>
              <Input
                className="w-[120px] pl-5 text-right"
                placeholder="Max"
                value={max ?? ""}
                onChange={(e) => setFilterPatch({ max: e.target.value || undefined })}
              />
            </div>
          </div>
        </div>

        {hasAnyFilters ? (
          <>
            <Separator />
            <ActiveFilterChips
              filters={{ categoryId, min, max }}
              categoriesById={allCategoriesById}
              onChange={setFilterPatch}
            />
          </>
        ) : null}
      </div>

      <div className="border-t border-border/60">
        <div className="h-[480px] overflow-auto bg-background/5 md:h-[560px]">
          <Table className="min-w-[980px]">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-background/40">
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "sticky top-0 z-10 bg-background/70 backdrop-blur-xl",
                        headerClassFor(header.column.id),
                      )}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {rows.length ? (
                  rows.map((row) => {
                    const txn = row.original;
                    const isCreated = createdId === txn.id;
                    const isFlashing = flash?.id === txn.id;
                    const flashOverlay = isFlashing && !reduceMotion ? "rgba(148,163,184,0.08)" : "rgba(0,0,0,0)";

                    return (
                      <motion.tr
                        key={row.id}
                        layout={!reduceMotion}
                        initial={isCreated && !reduceMotion ? { opacity: 0, y: -10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: -4, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }
                        }
                        transition={{
                          duration: 0.2,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={cn(
                          "border-b border-border/60 transition-colors data-[state=selected]:bg-background/20",
                          "group",
                          "cursor-pointer select-none",
                          "hover:bg-background/10",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        )}
                        tabIndex={onRowClick ? 0 : -1}
                        role={onRowClick ? "button" : undefined}
                        onClick={() => onRowClick?.(txn)}
                        onKeyDown={(e) => {
                          if (!onRowClick) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(txn);
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cn(cellClassFor(cell.column.id), "p-0")}>
                            <motion.div
                              initial={false}
                              animate={{
                                height: "auto",
                                opacity: 1,
                                paddingTop: 12,
                                paddingBottom: 12,
                                backgroundColor: flashOverlay,
                              }}
                              exit={{
                                height: 0,
                                opacity: 0,
                                paddingTop: 0,
                                paddingBottom: 0,
                              }}
                              transition={
                                reduceMotion
                                  ? { duration: 0 }
                                  : {
                                      duration: 0.18,
                                      ease: [0.16, 1, 0.3, 1],
                                      opacity: { duration: 0.12 },
                                      backgroundColor: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
                                    }
                              }
                              style={{ paddingLeft: 12, paddingRight: 12 }}
                              className="overflow-hidden"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </motion.div>
                          </TableCell>
                        ))}
                      </motion.tr>
                    );
                  })
                ) : (
                  <motion.tr
                    key="empty"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-border/60"
                  >
                    <TableCell colSpan={colCount} className="h-[520px] text-center text-sm text-muted-foreground">
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col items-center gap-3"
                      >
                        {isFiltered ? (
                          <>
                            <div className="rounded-full bg-background/20 p-3">
                              <FilterX className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="text-sm">No transactions match your filters.</div>
                          </>
                        ) : (
                          <>
                            <div className="rounded-full bg-background/20 p-3">
                              <Inbox className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div className="space-y-1 text-center">
                              <div className="font-semibold text-foreground/80">No transactions yet</div>
                              <div className="text-sm">Use Quick Add above to log your first one.</div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </TableCell>
                  </motion.tr>
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-background/10 p-3">
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground/90">{start}</span>–
          <span className="font-semibold text-foreground/90">{end}</span> of{" "}
          <span className="font-semibold text-foreground/90">{totalRows.toLocaleString()}</span>
          <span className="mx-2 text-muted-foreground/60">•</span>
          Page{" "}
          <span className="font-semibold text-foreground/90">
            {pageCount ? pagination.pageIndex + 1 : 0}
          </span>{" "}
          / <span className="font-semibold text-foreground/90">{pageCount}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => {
                const next = Number(v);
                if (!Number.isFinite(next) || next <= 0) return;
                table.setPageSize(next);
              }}
            >
              <SelectTrigger className="h-8 w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              disabled={!canPrev}
              onClick={() => table.setPageIndex(0)}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              disabled={!canPrev}
              onClick={() => table.previousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              disabled={!canNext}
              onClick={() => table.nextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              disabled={!canNext}
              onClick={() => table.setPageIndex(Math.max(0, pageCount - 1))}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

