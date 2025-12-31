import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, Check, DollarSign, StickyNote, Store, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types";
import { useCategoriesQuery, useCreateTransactionMutation, useDeleteTransactionMutation, useUpdateTransactionMutation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { buildCategoryTreeRows } from "@/lib/categoryHierarchy";

const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  categoryId: z.string().min(1, "Pick a category"),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .refine((v) => Number.isFinite(Number(v.replace(/[^0-9.-]/g, ""))), "Invalid amount"),
  merchant: z.string().optional(),
  notes: z.string().optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

function parseAmountToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Math.round(n * 100);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: Transaction;
}) {
  const { open, onOpenChange, mode, initial } = props;
  const categoriesQuery = useCategoriesQuery();
  const createTxn = useCreateTransactionMutation();
  const updateTxn = useUpdateTransactionMutation();
  const deleteTxn = useDeleteTransactionMutation();

  const categories = categoriesQuery.data ?? [];
  const categoriesById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeCategories = React.useMemo(() => categories.filter((c) => c.active), [categories]);
  const categoryRows = React.useMemo(() => buildCategoryTreeRows(activeCategories), [activeCategories]);

  const indentClass = React.useCallback((depth: number) => {
    if (depth <= 0) return undefined;
    const pl = ["pl-12", "pl-16", "pl-20", "pl-24", "pl-28"];
    return pl[Math.min(depth - 1, pl.length - 1)]!;
  }, []);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      date: initial?.date ?? todayYmd(),
      categoryId: initial?.categoryId ?? "",
      amount: initial ? String(initial.amountCents / 100) : "",
      merchant: initial?.merchant ?? "",
      notes: initial?.notes ?? "",
    },
    mode: "onChange",
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      date: initial?.date ?? todayYmd(),
      categoryId: initial?.categoryId ?? "",
      amount: initial ? String(initial.amountCents / 100) : "",
      merchant: initial?.merchant ?? "",
      notes: initial?.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const submitting = createTxn.isPending || updateTxn.isPending || deleteTxn.isPending;

  async function onSubmit(values: TransactionFormValues) {
    const category = categoriesById.get(values.categoryId);
    if (!category) {
      toast.error("Category not found");
      return;
    }

    let amountCents = parseAmountToCents(values.amount);
    if (amountCents === 0) {
      toast.error("Amount cannot be 0");
      return;
    }

    // UX: If user enters a positive number but chooses an expense category, store as negative.
    if (amountCents > 0 && category.kind === "expense") amountCents = -amountCents;
    if (amountCents < 0 && category.kind === "income") amountCents = Math.abs(amountCents);

    const payload = {
      date: values.date,
      categoryId: values.categoryId,
      amountCents,
      merchant: values.merchant?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
    };

    if (mode === "create") {
      await createTxn.mutateAsync(payload);
      onOpenChange(false);
      return;
    }

    if (!initial) return;
    await updateTxn.mutateAsync({ id: initial.id, payload });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Transaction" : "Edit Transaction"}</DialogTitle>
          <DialogDescription>
            Keyboard friendly: tab through fields, Enter to save, Esc to close.
          </DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 space-y-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="txn-date" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Date
              </Label>
              <Input id="txn-date" type="date" {...form.register("date")} />
              {form.formState.errors.date?.message && (
                <div className="text-xs text-danger">{form.formState.errors.date.message}</div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="txn-amount" className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Amount
              </Label>
              <Input
                id="txn-amount"
                inputMode="decimal"
                placeholder="e.g. 42.50"
                {...form.register("amount")}
              />
              {form.formState.errors.amount?.message && (
                <div className="text-xs text-danger">{form.formState.errors.amount.message}</div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              Category
            </Label>
            <Select
              value={form.watch("categoryId")}
              onValueChange={(v) => form.setValue("categoryId", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder={categoriesQuery.isLoading ? "Loading…" : "Select a category"} />
              </SelectTrigger>
              <SelectContent>
                {categoryRows.map((row) => {
                  const c = row.category;
                  const isChild = row.depth > 0;
                  const isParent = row.hasChildren;
                  return (
                    <SelectItem
                      key={c.id}
                      value={c.id}
                      disabled={isParent}
                      className={cn(indentClass(row.depth), isParent && "font-semibold")}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-muted-foreground">
                          {c.kind === "income" ? "↗" : "↘"}
                        </span>
                        {isChild ? <span className="shrink-0 text-muted-foreground">↳</span> : null}
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {form.formState.errors.categoryId?.message && (
              <div className="text-xs text-danger">{form.formState.errors.categoryId.message}</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="txn-merchant" className="flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                Merchant
              </Label>
              <Input id="txn-merchant" placeholder="e.g. Trader Joe's" {...form.register("merchant")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="txn-notes" className="flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                Notes
              </Label>
              <Input id="txn-notes" placeholder="Optional" {...form.register("notes")} />
            </div>
          </div>

          <div className={cn("space-y-1.5", "hidden")}>
            {/* reserved for future advanced fields */}
            <Label>Details</Label>
            <Textarea />
          </div>

          <DialogFooter>
            {mode === "edit" && initial ? (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={submitting}
                onClick={async () => {
                  if (!confirm("Delete this transaction?")) return;
                  await deleteTxn.mutateAsync({ id: initial.id, transaction: initial });
                  onOpenChange(false);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              <Check className="mr-2 h-4 w-4" />
              {mode === "create" ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

