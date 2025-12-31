import React from "react";
import { CalendarRange, Filter, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCategoriesQuery } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { readString, readStringList, writeListOrDelete, writeOrDelete } from "@/lib/urlState";

export function DashboardFilters() {
  const [sp, setSp] = useSearchParams();
  const from = readString(sp, "from");
  const to = readString(sp, "to");
  const categoryId = readStringList(sp, "categoryId") ?? [];
  const min = readString(sp, "min");
  const max = readString(sp, "max");

  const setPatch = React.useCallback(
    (patch: Partial<{ from: string | undefined; to: string | undefined; categoryId: string[] | undefined; min: string | undefined; max: string | undefined }>) => {
      const next = new URLSearchParams(sp);
      if ("from" in patch) writeOrDelete(next, "from", patch.from);
      if ("to" in patch) writeOrDelete(next, "to", patch.to);
      if ("min" in patch) writeOrDelete(next, "min", patch.min);
      if ("max" in patch) writeOrDelete(next, "max", patch.max);
      if ("categoryId" in patch) writeListOrDelete(next, "categoryId", patch.categoryId);
      setSp(next, { replace: true });
    },
    [setSp, sp],
  );

  const categoriesQuery = useCategoriesQuery();
  const categories = (categoriesQuery.data ?? []).filter((c) => c.active);
  const selectedSet = new Set(categoryId);

  const hasAny =
    Boolean(from) || Boolean(to) || categoryId.length > 0 || Boolean(min) || Boolean(max);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <CalendarRange className="h-4 w-4" />
              Date range
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[340px]">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Date range</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={from ?? ""}
                    onChange={(e) => setPatch({ from: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={to ?? ""}
                    onChange={(e) => setPatch({ to: e.target.value || undefined })}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setPatch({ from: undefined, to: undefined })}>
                  Clear dates
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              <Filter className="h-4 w-4" />
              Category
              {categoryId.length ? (
                <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary-foreground/90 ring-1 ring-primary/20">
                  {categoryId.length}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Categories</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {categories.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={selectedSet.has(c.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selectedSet);
                  if (checked) next.add(c.id);
                  else next.delete(c.id);
                  setPatch({ categoryId: Array.from(next) });
                }}
              >
                <span className={c.kind === "income" ? "text-income" : "text-expense"}>
                  {c.kind === "income" ? "↗" : "↘"}
                </span>{" "}
                {c.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setPatch({ categoryId: undefined })}
            >
              Clear categories
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Input
            className="w-[130px]"
            placeholder="Min $"
            value={min ?? ""}
            onChange={(e) => setPatch({ min: e.target.value || undefined })}
          />
          <Input
            className="w-[130px]"
            placeholder="Max $"
            value={max ?? ""}
            onChange={(e) => setPatch({ max: e.target.value || undefined })}
          />
        </div>

        {hasAny ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setPatch({
                from: undefined,
                to: undefined,
                categoryId: undefined,
                min: undefined,
                max: undefined,
              })
            }
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}






