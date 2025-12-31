import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Category } from "@/types";
import { useCategoriesQuery, useCreateCategoryMutation, useUpdateCategoryMutation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.enum(["expense", "income"]),
  parentId: z.string().optional(),
  active: z.boolean(),
});

type Values = z.infer<typeof schema>;

export function CategoryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: Category;
  defaultKind?: "expense" | "income";
  defaultParentId?: string | null;
}) {
  const { open, onOpenChange, mode, initial, defaultKind, defaultParentId } = props;
  const categoriesQuery = useCategoriesQuery();
  const createCat = useCreateCategoryMutation();
  const updateCat = useUpdateCategoryMutation();

  const baseKind = initial?.kind ?? defaultKind ?? "expense";
  const baseParentId =
    initial?.parentId ?? (defaultParentId != null ? defaultParentId : undefined);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      kind: baseKind,
      parentId: baseParentId,
      active: initial?.active ?? true,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      name: initial?.name ?? "",
      kind: initial?.kind ?? defaultKind ?? "expense",
      parentId: initial?.parentId ?? (defaultParentId != null ? defaultParentId : undefined),
      active: initial?.active ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, defaultKind, defaultParentId]);

  const submitting = createCat.isPending || updateCat.isPending;
  const categories = categoriesQuery.data ?? [];
  const kind = form.watch("kind");

  const parentOptions = categories
    .filter((c) => c.kind === kind && c.active)
    .filter((c) => (initial ? c.id !== initial.id : true));

  async function onSubmit(v: Values) {
    const payload = {
      name: v.name.trim(),
      kind: v.kind,
      parentId: v.parentId ? v.parentId : null,
      active: v.active,
    } as const;

    if (mode === "create") {
      await createCat.mutateAsync(payload);
      onOpenChange(false);
      return;
    }
    if (!initial) return;
    await updateCat.mutateAsync({ id: initial.id, payload });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Category" : "Edit Category"}</DialogTitle>
          <DialogDescription>Keep categories tidy: use parents for grouping.</DialogDescription>
        </DialogHeader>

        <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="e.g. Groceries" {...form.register("name")} />
            {form.formState.errors.name?.message ? (
              <div className="text-xs text-danger">{form.formState.errors.name.message}</div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => form.setValue("kind", v as "expense" | "income", { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Parent (optional)</Label>
              <Select
                value={form.watch("parentId") ?? "none"}
                onValueChange={(v) => form.setValue("parentId", v === "none" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Active</div>
              <div className="text-xs text-muted-foreground">Inactive categories won’t show up in pickers.</div>
            </div>
            <Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

