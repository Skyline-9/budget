import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCategoriesQuery, useCreateTransactionMutation } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { buildCategoryTreeRows } from "@/lib/categoryHierarchy";
import { formatDateDisplay } from "@/lib/format";
import { readString, writeOrDelete } from "@/lib/urlState";
import dotsOverlayUrl from "@/assets/dashboard/dots-overlay.svg";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().min(1),
  amount: z.string().min(1),
  merchant: z.string().optional(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function parseAmountToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Math.round(n * 100);
}

const FIRST_TX_KEY = "budget.onboarding.firstTransactionDone";

export function QuickAddTransaction() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const categoriesQuery = useCategoriesQuery();
  const categories = (categoriesQuery.data ?? []).filter((c) => c.active);
  const categoriesById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryRows = React.useMemo(() => buildCategoryTreeRows(categories), [categories]);

  const createTxn = useCreateTransactionMutation();
  const [keepValues, setKeepValues] = React.useState(false);
  const [keepDate, setKeepDate] = React.useState(true);
  const [showFirstSuccess, setShowFirstSuccess] = React.useState(false);
  const firstSuccessTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (firstSuccessTimerRef.current) window.clearTimeout(firstSuccessTimerRef.current);
    };
  }, []);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: todayYmd(), categoryId: "", amount: "", merchant: "", notes: "" },
  });

  const watchedDate = form.watch("date");
  const watchedCategoryId = form.watch("categoryId");
  const selectedCategory = categoriesById.get(watchedCategoryId);
  const amountBadge = { label: "Auto", variant: "subtle" as const };

  const expandRangeToDate = React.useCallback(
    (date: string) => {
      const next = new URLSearchParams(searchParams);
      const from = readString(next, "from");
      const to = readString(next, "to");
      const nextFrom = from ? (date < from ? date : from) : date;
      const nextTo = to ? (date > to ? date : to) : date;
      writeOrDelete(next, "from", nextFrom);
      writeOrDelete(next, "to", nextTo);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  async function onSubmit(v: Values) {
    const cat = categoriesById.get(v.categoryId);
    if (!cat) {
      toast.error("Pick a category");
      return;
    }
    let amountCents = parseAmountToCents(v.amount);
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      toast.error("Invalid amount");
      return;
    }
    if (amountCents > 0 && cat.kind === "expense") amountCents = -amountCents;
    if (amountCents < 0 && cat.kind === "income") amountCents = Math.abs(amountCents);

    await createTxn.mutateAsync({
      date: v.date,
      categoryId: v.categoryId,
      amountCents,
      merchant: v.merchant?.trim() || undefined,
      notes: v.notes?.trim() || undefined,
    });

    // Subtle onboarding success: only once per browser.
    try {
      const seen = localStorage.getItem(FIRST_TX_KEY);
      if (!seen) {
        localStorage.setItem(FIRST_TX_KEY, "true");
        setShowFirstSuccess(true);
        if (firstSuccessTimerRef.current) window.clearTimeout(firstSuccessTimerRef.current);
        firstSuccessTimerRef.current = window.setTimeout(() => setShowFirstSuccess(false), 2200);
      }
    } catch {
      // ignore
    }

    const rangeFrom = readString(searchParams, "from");
    const rangeTo = readString(searchParams, "to");
    const isOutside =
      (rangeFrom && v.date < rangeFrom) || (rangeTo && v.date > rangeTo);
    if (isOutside) {
      toast.message("Added. Update filters to show it?", {
        action: {
          label: "Expand range",
          onClick: () => expandRangeToDate(v.date),
        },
      });
    }

    form.reset({
      date: keepValues ? (keepDate ? v.date : todayYmd()) : todayYmd(),
      categoryId: keepValues ? v.categoryId : "",
      amount: "",
      merchant: "",
      notes: "",
    });
    form.setFocus("amount");
  }

  const submitting = createTxn.isPending;

  const indentClass = React.useCallback((depth: number) => {
    if (depth <= 0) return undefined;
    const pl = ["pl-12", "pl-16", "pl-20", "pl-24", "pl-28"];
    return pl[Math.min(depth - 1, pl.length - 1)]!;
  }, []);

  return (
    <div className="relative rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg corner-glow tint-neutral overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10] dark:opacity-[0.08]">
        <img src={dotsOverlayUrl} alt="" className="h-full w-full object-cover scale-50" />
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Quick Add
          </div>
          <div className="text-xs text-muted-foreground">
            Enter submits • Esc clears • Auto-sign by category
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/20 px-3 py-1">
            <Switch id="keep-values" checked={keepValues} onCheckedChange={setKeepValues} />
            <Label htmlFor="keep-values" className="text-xs text-foreground/80">
              Keep values
            </Label>
          </div>
          <div
            className={`flex items-center gap-2 rounded-2xl border border-border/60 bg-background/20 px-3 py-1 ${
              keepValues ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <Switch
              id="keep-date"
              checked={keepDate}
              onCheckedChange={setKeepDate}
              disabled={!keepValues}
            />
            <Label htmlFor="keep-date" className="text-xs text-foreground/80">
              Keep date
            </Label>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFirstSuccess ? (
          <motion.div
            key="first-tx"
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 rounded-2xl border border-border/60 bg-background/20 px-3 py-2 text-sm"
            role="status"
            aria-live="polite"
          >
            <span className="font-semibold">First transaction added.</span>{" "}
            <span className="text-muted-foreground">Nice—now it's easy to keep momentum.</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form
        className="relative z-10 mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[150px_240px_160px_1fr_1fr_auto]"
        onSubmit={form.handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            form.reset({ date: todayYmd(), categoryId: "", amount: "", merchant: "", notes: "" });
          }
        }}
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Date</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground">{formatDateDisplay(watchedDate)}</span>
              </TooltipTrigger>
              <TooltipContent>{watchedDate}</TooltipContent>
            </Tooltip>
          </div>
          <Input type="date" {...form.register("date")} />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={watchedCategoryId}
            onValueChange={(v) => {
              if (v === "__create__") {
                navigate("/categories");
                return;
              }
              form.setValue("categoryId", v, { shouldValidate: true });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={categoriesQuery.isLoading ? "Loading…" : "Select"} />
            </SelectTrigger>
            <SelectContent>
              {categoryRows.map((row) => (
                <SelectItem
                  key={row.category.id}
                  value={row.category.id}
                  className={cn(indentClass(row.depth), row.hasChildren && "font-semibold")}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      {row.category.kind === "income" ? "↗" : "↘"}
                    </span>
                    {row.depth > 0 ? <span className="shrink-0 text-muted-foreground">↳</span> : null}
                    <span className="min-w-0 flex-1 truncate">{row.category.name}</span>
                  </div>
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="__create__">+ Create category…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Amount</Label>
            <Badge variant={amountBadge.variant}>{amountBadge.label}</Badge>
          </div>
          <Input inputMode="decimal" placeholder="42.50" {...form.register("amount")} />
        </div>

        <div className="space-y-1.5">
          <Label>Merchant</Label>
          <Input placeholder="Merchant" {...form.register("merchant")} />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input placeholder="Notes" {...form.register("notes")} />
        </div>

        <div className="flex items-end">
          <Button type="submit" disabled={submitting} className="w-full">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}
