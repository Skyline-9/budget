import React from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { CalendarRange, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { formatRange } from "@/lib/format";

type TopbarProps = {
  searchRef: React.RefObject<HTMLInputElement>;
  query: string;
  onSubmitSearch: (q: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  from?: string;
  to?: string;
  onChangeDateRange: (range: { from?: string; to?: string }) => void;
  onAddTransaction: () => void;
  addButtonVariant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  showDateRange?: boolean;
  showAddButton?: boolean;
};

function presetThisMonth() {
  const now = new Date();
  return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
}

function presetLastMonth() {
  const d = subMonths(new Date(), 1);
  return { from: format(startOfMonth(d), "yyyy-MM-dd"), to: format(endOfMonth(d), "yyyy-MM-dd") };
}

function presetYtd() {
  const now = new Date();
  return { from: format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
}

function labelForRange(from?: string, to?: string) {
  if (!from && !to) return "All time";
  const tm = presetThisMonth();
  const lm = presetLastMonth();
  const ytd = presetYtd();
  if (from === tm.from && to === tm.to) return "This month";
  if (from === lm.from && to === lm.to) return "Last month";
  if (from === ytd.from && to === ytd.to) return "YTD";
  return formatRange(from, to);
}

export function Topbar({
  searchRef,
  query,
  onSubmitSearch,
  searchPlaceholder = "Search merchant or notes…",
  searchAriaLabel = "Global search (Cmd/Ctrl+K)",
  from,
  to,
  onChangeDateRange,
  onAddTransaction,
  addButtonVariant = "default",
  showDateRange = true,
  showAddButton = true,
}: TopbarProps) {
  const [q, setQ] = React.useState(query);

  React.useEffect(() => setQ(query), [query]);

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/40 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative w-full max-w-[560px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmitSearch(q.trim());
              }}
              placeholder={searchPlaceholder}
              className={cn(
                "pl-9 pr-16",
              )}
              aria-label={searchAriaLabel}
            />
            <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
              <span className="rounded-lg border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                ⌘K
              </span>
            </div>
          </div>

          {showDateRange ? (
          <div className="hidden md:flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="md"
                  title={from || to ? `${from ?? "…"} → ${to ?? "…"}`
                    : "All time"}
                >
                  <CalendarRange className="h-4 w-4" />
                  <span>{labelForRange(from, to)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px]" align="end">
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground">Quick ranges</div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onChangeDateRange(presetThisMonth())}
                    >
                      This month
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onChangeDateRange(presetLastMonth())}
                    >
                      Last month
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onChangeDateRange(presetYtd())}>
                      YTD
                    </Button>
                  </div>

                  <div className="pt-1">
                    <div className="text-xs font-semibold text-muted-foreground">Custom</div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>From</Label>
                        <Input
                          type="date"
                          value={from ?? ""}
                          onChange={(e) => onChangeDateRange({ from: e.target.value || undefined, to })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>To</Label>
                        <Input
                          type="date"
                          value={to ?? ""}
                          onChange={(e) => onChangeDateRange({ from, to: e.target.value || undefined })}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => onChangeDateRange({ from: undefined, to: undefined })}>
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          ) : null}
        </div>

        {showAddButton ? (
          <Button
            variant={addButtonVariant}
            onClick={onAddTransaction}
            aria-keyshortcuts="N"
            title="Shortcut: N"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Transaction</span>
            <kbd className="hidden sm:inline-flex items-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground/90">
              N
            </kbd>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
