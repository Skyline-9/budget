import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useDeleteOverallBudgetMutation, useUpsertOverallBudgetMutation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMonthKey } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/urlState";

const schema = z.object({
  budget: z
    .string()
    .min(1, "Budget is required")
    .refine((v) => {
      const cents = parseMoneyToCents(v);
      return cents !== undefined && cents >= 0;
    }, "Enter a non-negative amount"),
});

type Values = z.infer<typeof schema>;

function centsToInput(v: number) {
  const s = (v / 100).toFixed(2);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

export function BudgetDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string; // YYYY-MM
  initialBudgetCents?: number | null;
}) {
  const { open, onOpenChange, month, initialBudgetCents } = props;
  const upsert = useUpsertOverallBudgetMutation();
  const del = useDeleteOverallBudgetMutation();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      budget: initialBudgetCents != null ? centsToInput(initialBudgetCents) : "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      budget: initialBudgetCents != null ? centsToInput(initialBudgetCents) : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month, initialBudgetCents]);

  const submitting = upsert.isPending || del.isPending;

  async function onSubmit(v: Values) {
    const cents = parseMoneyToCents(v.budget);
    if (cents === undefined) return;
    await upsert.mutateAsync({ month, budgetCents: cents });
    onOpenChange(false);
  }

  async function onDelete() {
    await del.mutateAsync(month);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Monthly budget</DialogTitle>
          <DialogDescription>Overall expense budget for {formatMonthKey(month)}.</DialogDescription>
        </DialogHeader>

        <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Input type="month" value={month} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Budget</Label>
              <Input inputMode="decimal" placeholder="e.g. 3000" {...form.register("budget")} />
              {form.formState.errors.budget?.message ? (
                <div className="text-xs text-danger">{form.formState.errors.budget.message}</div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div>
              {initialBudgetCents != null ? (
                <Button type="button" variant="destructive" disabled={submitting} onClick={onDelete}>
                  Delete budget
                </Button>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}




