import React from "react";
import { Copy, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@/types";
import { useTransactionsQuery, useUpdateCategoryMutation } from "@/api/queries";
import { categoryMoveErrorMessage, validateCategoryMove } from "@/lib/categoryHierarchy";
import { cn } from "@/lib/cn";
import { formatDateDisplay, formatRange } from "@/lib/format";
import { AnimatedMoneyCents } from "@/components/motion/AnimatedNumber";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getCategoryColorOptions } from "@/theme/palette";

function kindLabel(kind: Category["kind"]) {
  return kind === "expense" ? "Expense" : "Income";
}

type InspectorProps = {
  category: Category;
  allCategories: Category[];
  from?: string;
  to?: string;
  onRequestDelete?: () => void;
  onClose: () => void;
};

function StatsBlock(props: { categoryId: string; from?: string; to?: string }) {
  const { categoryId, from, to } = props;
  const txQuery = useTransactionsQuery({ from, to, categoryId: [categoryId] });

  const txs = txQuery.data ?? [];
  const count = txs.length;
  const totalCents = txs.reduce((sum, t) => sum + t.amountCents, 0);
  const lastUsed = txs.reduce<string | null>((max, t) => (max == null || t.date > max ? t.date : max), null);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">Stats</div>
        <div className="text-xs text-muted-foreground" title={formatRange(from, to)}>
          {formatRange(from, to)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="mt-1 text-sm font-semibold">
            {txQuery.isLoading ? <Skeleton className="h-5 w-10" /> : count}
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="mt-1 text-sm font-semibold">
            {txQuery.isLoading ? <Skeleton className="h-5 w-20" /> : <AnimatedMoneyCents cents={totalCents} />}
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <div className="text-xs text-muted-foreground">Last used</div>
          <div className="mt-1 text-sm font-semibold">
            {txQuery.isLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : lastUsed ? (
              formatDateDisplay(lastUsed)
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryInspectorContent(props: InspectorProps) {
  const { category, allCategories, from, to, onRequestDelete, onClose } = props;
  const update = useUpdateCategoryMutation();

  const [name, setName] = React.useState(category.name);
  const [parentId, setParentId] = React.useState<string | null>(category.parentId ?? null);
  const [active, setActive] = React.useState<boolean>(category.active);
  const parentTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const nameInputId = React.useId();

  React.useEffect(() => {
    setName(category.name);
    setParentId(category.parentId ?? null);
    setActive(category.active);
  }, [category.id]); // reset on selection changes

  const trimmedName = name.trim();
  const dirty = trimmedName !== category.name || (parentId ?? null) !== (category.parentId ?? null) || active !== category.active;

  const colorOptions = React.useMemo(() => getCategoryColorOptions(), []);

  const parentOptions = React.useMemo(() => {
    const options = allCategories
      .filter((c) => c.kind === category.kind)
      .filter((c) => c.id !== category.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Filter invalid parents (self/descendant/cross-kind).
    return options.filter((p) => validateCategoryMove({ categories: allCategories, categoryId: category.id, newParentId: p.id }).ok);
  }, [allCategories, category.id, category.kind]);

  const moveValidation = validateCategoryMove({ categories: allCategories, categoryId: category.id, newParentId: parentId });
  const moveError = categoryMoveErrorMessage(moveValidation);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(category.id);
      toast.success("Copied ID");
    } catch {
      toast.error("Couldn’t copy");
    }
  }

  async function save() {
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (!moveValidation.ok) {
      toast.error(moveError ?? "Invalid move");
      return;
    }

    await update.mutateAsync({
      id: category.id,
      payload: {
        name: trimmedName,
        parentId,
        active,
      },
    });
  }

  async function toggleArchived(nextActive: boolean) {
    const label = nextActive ? "Restore this category?" : "Archive this category?";
    const ok = window.confirm(label);
    if (!ok) return;
    setActive(nextActive);
    await update.mutateAsync({ id: category.id, payload: { active: nextActive } });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Inspector</div>
          <div className="mt-1 truncate text-lg font-semibold tracking-tight">{category.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="subtle">{kindLabel(category.kind)}</Badge>
            {!category.active ? <Badge variant="subtle">Inactive</Badge> : null}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close inspector">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="my-4" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor={nameInputId}>Display name</Label>
          <Input
            id={nameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
            aria-label="Display name"
          />
          {!trimmedName ? <div className="text-xs text-danger">Name is required.</div> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-2 text-sm">
              {kindLabel(category.kind)}
              <div className="text-xs text-muted-foreground">Type changes aren’t supported here yet.</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Parent</Label>
            <Select
              value={parentId ?? "none"}
              onValueChange={(v) => setParentId(v === "none" ? null : v)}
            >
              <SelectTrigger ref={parentTriggerRef} aria-label="Select parent category">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {moveError ? (
              <div className="flex items-center gap-2 text-xs text-danger">
                <ShieldAlert className="h-3.5 w-3.5" />
                {moveError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Color / icon</Label>
            <div className="text-xs text-muted-foreground">Coming soon</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {colorOptions.map((c) => (
              <button
                key={c}
                type="button"
                disabled
                className={cn(
                  "h-7 w-7 rounded-2xl border border-border/60 opacity-60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
                style={{ backgroundColor: c }}
                aria-label="Color option (coming soon)"
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-muted-foreground">Internal ID</div>
              <div className="mt-1 font-mono text-xs text-foreground">{category.id}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={copyId} aria-label="Copy internal ID">
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </div>

        <StatsBlock categoryId={category.id} from={from} to={to} />

        <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold tracking-tight">Active</div>
              <div className="text-xs text-muted-foreground">Inactive categories won’t show up in pickers.</div>
            </div>
            <Switch
              checked={active}
              onCheckedChange={(v) => setActive(v)}
              aria-label={active ? "Mark category inactive" : "Mark category active"}
            />
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "Up to date"}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={!dirty || update.isPending} onClick={save}>
              Rename / Save
            </Button>
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => {
                parentTriggerRef.current?.focus();
                parentTriggerRef.current?.click();
              }}
              aria-label="Move to parent"
            >
              Move…
            </Button>
            <Button variant="secondary" disabled title="Merge isn’t supported yet">
              Merge…
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/20 p-3">
          <div className="text-xs font-semibold text-muted-foreground">Danger zone</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => toggleArchived(!active)}
              aria-label={!active ? "Restore category" : "Archive category"}
            >
              {!active ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="destructive"
              disabled={update.isPending || !onRequestDelete}
              title={!onRequestDelete ? "Delete is unavailable here." : undefined}
              onClick={() => onRequestDelete?.()}
            >
              Delete…
            </Button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Delete requires reassigning existing transactions to another category.
          </div>
        </div>
      </div>
    </div>
  );
}

export function CategoryInspectorPanel(props: InspectorProps & { containerRef?: React.Ref<HTMLDivElement> }) {
  const { containerRef, ...rest } = props;
  return (
    <div
      ref={containerRef as any}
      className="h-[calc(100dvh-7.25rem)] rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg"
    >
      <CategoryInspectorContent {...rest} />
    </div>
  );
}

export function CategoryInspectorSheet(props: InspectorProps & { open: boolean }) {
  const { open, onClose, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "left-0 top-0 h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none",
          "sm:left-auto sm:right-0 sm:w-[440px] sm:rounded-l-3xl",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Category inspector</DialogTitle>
          <DialogDescription>View and edit category details.</DialogDescription>
        </DialogHeader>
        <CategoryInspectorContent {...rest} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
