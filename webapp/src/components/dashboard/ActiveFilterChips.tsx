import React from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { X } from "lucide-react";
import type { Category } from "@/types";
import { cn } from "@/lib/cn";
import { formatCents, formatYmdToShort } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/urlState";

export type DashboardFilterState = {
  from?: string;
  to?: string;
  categoryId: string[];
  min?: string;
  max?: string;
  q?: string;
};

function Chip({
  label,
  onRemove,
  dotColor,
}: {
  label: string;
  onRemove: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/35 px-3 py-1 text-xs",
        "text-foreground/90 hover:bg-accent/50 hover:text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
      onClick={onRemove}
    >
      {dotColor ? (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
      ) : null}
      <span className="max-w-[220px] truncate">{label}</span>
      <X className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function formatDateChip(from?: string, to?: string) {
  if (!from && !to) return undefined;
  if (from && to) return `Date: ${formatYmdToShort(from)} – ${formatYmdToShort(to)}`;
  if (from) return `Date: from ${formatYmdToShort(from)}`;
  return `Date: to ${formatYmdToShort(to!)}`;
}

function baselineThisMonth() {
  const now = new Date();
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function ActiveFilterChips({
  filters,
  categoriesById,
  onChange,
}: {
  filters: DashboardFilterState;
  categoriesById: Map<string, Category>;
  onChange: (patch: Partial<DashboardFilterState>) => void;
}) {
  const chips: React.ReactNode[] = [];
  const baseline = baselineThisMonth();
  const isDefaultDate = filters.from === baseline.from && filters.to === baseline.to;

  const dateLabel =
    filters.from || filters.to ? formatDateChip(filters.from, filters.to) : undefined;
  if (dateLabel && !isDefaultDate) {
    chips.push(
      <Chip
        key="date"
        label={dateLabel}
        onRemove={() => onChange({ from: baseline.from, to: baseline.to })}
      />,
    );
  }

  if (filters.q) {
    chips.push(
      <Chip key="q" label={`Search: ${filters.q}`} onRemove={() => onChange({ q: undefined })} />,
    );
  }

  for (const id of filters.categoryId) {
    const name = categoriesById.get(id)?.name ?? "Unknown";
    const kind = categoriesById.get(id)?.kind;
    const dotColor =
      kind === "income"
        ? "hsl(var(--income) / 0.95)"
        : kind === "expense"
          ? "hsl(var(--expense) / 0.95)"
          : undefined;
    chips.push(
      <Chip
        key={`cat:${id}`}
        label={`Category: ${name}`}
        dotColor={dotColor}
        onRemove={() =>
          onChange({ categoryId: filters.categoryId.filter((x) => x !== id) })
        }
      />,
    );
  }

  if (filters.min) {
    const cents = parseMoneyToCents(filters.min);
    const label = cents !== undefined ? `Min: ${formatCents(cents)}` : `Min: ${filters.min}`;
    chips.push(<Chip key="min" label={label} onRemove={() => onChange({ min: undefined })} />);
  }

  if (filters.max) {
    const cents = parseMoneyToCents(filters.max);
    const label = cents !== undefined ? `Max: ${formatCents(cents)}` : `Max: ${filters.max}`;
    chips.push(<Chip key="max" label={label} onRemove={() => onChange({ max: undefined })} />);
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips}
      <button
        type="button"
        className={cn(
          "ml-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-lg px-2 py-1",
        )}
        onClick={() =>
          onChange({
            from: baseline.from,
            to: baseline.to,
            q: undefined,
            categoryId: [],
            min: undefined,
            max: undefined,
          })
        }
      >
        Clear all
      </button>
    </div>
  );
}

