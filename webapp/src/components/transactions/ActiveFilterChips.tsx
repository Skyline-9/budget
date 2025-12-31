import React from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Category } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/urlState";

export type TransactionsFilterState = {
  categoryId: string[];
  min?: string;
  max?: string;
};

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/35 px-3 py-1 text-xs",
        "text-foreground/90 hover:bg-background/50 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
      onClick={onRemove}
    >
      <span className="max-w-[220px] truncate">{label}</span>
      <X className="h-3.5 w-3.5 text-muted-foreground" />
    </motion.button>
  );
}

export function ActiveFilterChips({
  filters,
  categoriesById,
  onChange,
}: {
  filters: TransactionsFilterState;
  categoriesById: Map<string, Category>;
  onChange: (patch: Partial<TransactionsFilterState>) => void;
}) {
  const chips: React.ReactNode[] = [];

  for (const id of filters.categoryId) {
    const category = categoriesById.get(id);
    const name = category?.name ?? "Unknown";
    chips.push(
      <Chip
        key={`cat:${id}`}
        label={`Category: ${name}`}
        onRemove={() =>
          onChange({ categoryId: filters.categoryId.filter((x) => x !== id) })
        }
      />,
    );
  }

  if (filters.min) {
    const cents = parseMoneyToCents(filters.min);
    const label = cents !== undefined ? `Min: ${formatMoney(cents)}` : `Min: ${filters.min}`;
    chips.push(<Chip key="min" label={label} onRemove={() => onChange({ min: undefined })} />);
  }

  if (filters.max) {
    const cents = parseMoneyToCents(filters.max);
    const label = cents !== undefined ? `Max: ${formatMoney(cents)}` : `Max: ${filters.max}`;
    chips.push(<Chip key="max" label={label} onRemove={() => onChange({ max: undefined })} />);
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs font-semibold text-muted-foreground">Active filters</div>
      <AnimatePresence initial={false}>{chips}</AnimatePresence>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-1"
        onClick={() => onChange({ categoryId: [], min: undefined, max: undefined })}
      >
        Clear
      </Button>
    </div>
  );
}
