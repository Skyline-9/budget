import React from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/api";
import { qk, useCategoriesQuery, useDeleteCategoryMutation } from "@/api/queries";
import type { Category, CategoryKind } from "@/types";
import { CategoryDialog } from "@/components/categories/CategoryDialog";
import { CategoryInspectorPanel, CategoryInspectorSheet } from "@/components/categories/CategoryInspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { categoryMoveErrorMessage, validateCategoryMove } from "@/lib/categoryHierarchy";

function useLocalStorageBoolean(key: string, defaultValue: boolean) {
  const [v, setV] = React.useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return defaultValue;
      return raw === "true";
    } catch {
      return defaultValue;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, v ? "true" : "false");
    } catch {
      // ignore
    }
  }, [key, v]);

  return [v, setV] as const;
}

type TreeRow = {
  category: Category;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  isExpanded: boolean;
};

function buildTreeRows(opts: {
  categories: Category[];
  collapsedIds: Set<string>;
  query: string;
  showIds: boolean;
}): TreeRow[] {
  const { categories, collapsedIds, query, showIds } = opts;
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const byId = new Map<string, Category>();
  for (const c of categories) byId.set(c.id, c);

  // Parent pointers, but treat invalid/mismatched parents as "None" to keep the tree well-formed.
  const parentById = new Map<string, string | null>();
  for (const c of categories) {
    const rawParent = c.parentId ?? null;
    const parent = rawParent ? byId.get(rawParent) : undefined;
    const effectiveParentId = parent && parent.kind === c.kind ? parent.id : null;
    parentById.set(c.id, effectiveParentId);
  }

  const childrenByParent = new Map<string | null, string[]>();
  for (const c of categories) {
    const pid = parentById.get(c.id) ?? null;
    const arr = childrenByParent.get(pid) ?? [];
    arr.push(c.id);
    childrenByParent.set(pid, arr);
  }

  for (const [pid, arr] of childrenByParent) {
    arr.sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? ""));
    childrenByParent.set(pid, arr);
  }

  const matchIds = new Set<string>();
  const visibleIds = new Set<string>();
  if (!isSearching) {
    for (const c of categories) visibleIds.add(c.id);
  } else {
    for (const c of categories) {
      const hay = c.name.toLowerCase();
      const idHay = c.id.toLowerCase();
      const matches = hay.includes(q) || (showIds && idHay.includes(q));
      if (matches) {
        matchIds.add(c.id);
        visibleIds.add(c.id);
      }
    }
    // Include ancestors for context so matched children don't appear "orphaned".
    for (const id of matchIds) {
      let cur = parentById.get(id) ?? null;
      while (cur) {
        visibleIds.add(cur);
        cur = parentById.get(cur) ?? null;
      }
    }
  }

  const rows: TreeRow[] = [];
  const visited = new Set<string>();

  const rootIds = (childrenByParent.get(null) ?? []).filter((id) => visibleIds.has(id));

  function walk(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const c = byId.get(id);
    if (!c) return;
    if (!visibleIds.has(id)) return;

    const kids = (childrenByParent.get(id) ?? []).filter((kid) => visibleIds.has(kid));
    const hasChildren = kids.length > 0;
    const expanded = isSearching ? true : !collapsedIds.has(id);

    rows.push({
      category: c,
      depth,
      hasChildren,
      childCount: kids.length,
      isExpanded: expanded,
    });

    if (hasChildren && expanded) {
      for (const kid of kids) walk(kid, depth + 1);
    }
  }

  for (const id of rootIds) walk(id, 0);
  return rows;
}

function CategoryTreeRow(props: {
  row: TreeRow;
  showIds: boolean;
  isSelected: boolean;
  isActive: boolean;
  isFocused: boolean;
  canToggle: boolean;
  draggingId: string | null;
  dropTarget: { id: string; valid: boolean } | null;
  onToggleExpand: (id: string) => void;
  onSelect: (c: Category, opts: { toggle: boolean; range: boolean }) => void;
  onEdit: (c: Category) => void;
  onFocusRow: (id: string) => void;
  onKeyDownRow: (c: Category, e: React.KeyboardEvent<HTMLDivElement>) => void;
  onDragStartRow: (id: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDragOverRow: (targetId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDropRow: (targetId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEndRow: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const {
    row,
    showIds,
    isSelected,
    isActive,
    isFocused,
    canToggle,
    draggingId,
    dropTarget,
    onToggleExpand,
    onSelect,
    onEdit,
    onFocusRow,
    onKeyDownRow,
    onDragStartRow,
    onDragOverRow,
    onDropRow,
    onDragEndRow,
    rowRef,
  } = props;
  const c = row.category;
  const isDragging = draggingId === c.id;
  const isDropTarget = dropTarget?.id === c.id && draggingId != null && draggingId !== c.id;
  const dropValid = Boolean(dropTarget?.valid);

  return (
    <div
      ref={rowRef}
      data-category-row
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.isExpanded : undefined}
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-2xl px-3 py-1.5",
        "cursor-pointer select-none active:cursor-grabbing",
        "transition-colors",
        "hover:bg-accent/40",
        isSelected && "bg-accent/35",
        isActive && "ring-1 ring-ring/35 bg-accent/55",
        isFocused && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        isDragging && "opacity-60",
        isDropTarget && (dropValid ? "ring-2 ring-primary/40 bg-primary/10" : "ring-2 ring-destructive/40"),
        !c.active && "opacity-60",
      )}
      draggable
      onFocus={() => onFocusRow(c.id)}
      onKeyDown={(e) => onKeyDownRow(c, e)}
      onClick={(e) => onSelect(c, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDragStart={(e) => onDragStartRow(c.id, e)}
      onDragOver={(e) => onDragOverRow(c.id, e)}
      onDrop={(e) => onDropRow(c.id, e)}
      onDragEnd={onDragEndRow}
    >
      <div className="min-w-0 flex items-start gap-2">
        <div className="flex items-center gap-1.5" style={{ marginLeft: row.depth * 14 }}>
          {row.hasChildren ? (
            <button
              type="button"
              className={cn(
                "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-2xl",
                "text-muted-foreground hover:bg-accent/70 hover:text-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                !canToggle && "pointer-events-none opacity-50",
              )}
              tabIndex={isFocused ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                if (canToggle) onToggleExpand(c.id);
              }}
              aria-label={row.isExpanded ? `Collapse ${c.name}` : `Expand ${c.name}`}
            >
              {row.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="mt-0.5 h-6 w-6" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <div className="truncate text-sm font-semibold tracking-tight">{c.name}</div>
            {row.childCount ? (
              <div className="shrink-0 text-xs text-muted-foreground">
                · {row.childCount}
              </div>
            ) : null}
          </div>
          {showIds ? <div className="text-xs text-muted-foreground">{c.id}</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!c.active ? <Badge variant="subtle">Inactive</Badge> : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          tabIndex={isFocused ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(c);
          }}
          aria-label={`Edit ${c.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CategoryGroup(props: {
  title: string;
  kind: CategoryKind;
  categories: Category[];
  collapsedIds: Set<string>;
  onToggleCollapsed: (id: string) => void;
  selectedIds: Set<string>;
  activeId: string | null;
  focusedId: string | null;
  query: string;
  showIds: boolean;
  draggingId: string | null;
  dropTarget: { id: string; valid: boolean } | null;
  onSelectRow: (c: Category, opts: { toggle: boolean; range: boolean; kind: CategoryKind; orderedIds: string[] }) => void;
  onEditRow: (c: Category) => void;
  onQuickAdd: (kind: CategoryKind) => void;
  onFocusRow: (kind: CategoryKind, id: string) => void;
  onDragStartRow: (id: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDragOverRow: (targetId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDropRow: (targetId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEndRow: () => void;
}) {
  const {
    title,
    kind,
    categories,
    collapsedIds,
    onToggleCollapsed,
    selectedIds,
    activeId,
    focusedId,
    query,
    showIds,
    draggingId,
    dropTarget,
    onSelectRow,
    onEditRow,
    onQuickAdd,
    onFocusRow,
    onDragStartRow,
    onDragOverRow,
    onDropRow,
    onDragEndRow,
  } = props;

  const rows = React.useMemo(
    () => buildTreeRows({ categories, collapsedIds, query, showIds }),
    [categories, collapsedIds, query, showIds],
  );
  const orderedIds = React.useMemo(() => rows.map((r) => r.category.id), [rows]);
  const focusId = React.useMemo(() => {
    if (focusedId && orderedIds.includes(focusedId)) return focusedId;
    return orderedIds[0] ?? null;
  }, [focusedId, orderedIds]);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());

  const isSearching = query.trim().length > 0;
  const onKeyDownLocal = React.useCallback(
    (c: Category, e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = orderedIds.indexOf(c.id);
        if (idx < 0) return;
        const nextId = e.key === "ArrowDown" ? orderedIds[idx + 1] : orderedIds[idx - 1];
        if (!nextId) return;
        rowRefs.current.get(nextId)?.focus();
        onFocusRow(kind, nextId);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onSelectRow(c, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey, kind, orderedIds });
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        onSelectRow(c, { toggle: true, range: false, kind, orderedIds });
      }
    },
    [kind, onFocusRow, onSelectRow, orderedIds],
  );

  return (
    <div className="rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="text-xs text-muted-foreground">{categories.length} categories</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onQuickAdd(kind)}
          aria-label={`Add ${kind === "expense" ? "expense" : "income"} category`}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">
            Add {kind === "expense" ? "Expense" : "Income"} category
          </span>
        </Button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-auto px-1" role="tree" aria-label={`${title} category tree`}>
        {rows.length ? (
          rows.map((row) => (
            <CategoryTreeRow
              key={row.category.id}
              row={row}
              showIds={showIds}
              isSelected={selectedIds.has(row.category.id)}
              isActive={activeId === row.category.id}
              isFocused={focusId === row.category.id}
              canToggle={!isSearching}
              draggingId={draggingId}
              dropTarget={dropTarget}
              onToggleExpand={onToggleCollapsed}
              onSelect={(c, click) => onSelectRow(c, { ...click, kind, orderedIds })}
              onEdit={onEditRow}
              onFocusRow={(id) => onFocusRow(kind, id)}
              onKeyDownRow={onKeyDownLocal}
              onDragStartRow={onDragStartRow}
              onDragOverRow={onDragOverRow}
              onDropRow={onDropRow}
              onDragEndRow={onDragEndRow}
              rowRef={(el) => {
                if (el) rowRefs.current.set(row.category.id, el);
                else rowRefs.current.delete(row.category.id);
              }}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
            {isSearching ? "No matching categories." : "No categories yet."}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoriesSidePanel(props: {
  expense: Category[];
  income: Category[];
  selectedCategories: Category[];
  selectedKind: CategoryKind | null;
  bulkBusy: boolean;
  archiveNextActive: boolean;
  bulkMoveSelectionError: string | null;
  deleteDisabledReason: string | null;
  onOpenBulkMove: () => void;
  onOpenDelete: () => void;
  onBulkArchiveRestore: () => void;
  onClearSelection: () => void;
  onQuickAdd: (kind: CategoryKind) => void;
}) {
  const {
    expense,
    income,
    selectedCategories,
    selectedKind,
    bulkBusy,
    archiveNextActive,
    bulkMoveSelectionError,
    deleteDisabledReason,
    onOpenBulkMove,
    onOpenDelete,
    onBulkArchiveRestore,
    onClearSelection,
    onQuickAdd,
  } = props;

  const selectedCount = selectedCategories.length;
  const expenseActive = expense.filter((c) => c.active).length;
  const incomeActive = income.filter((c) => c.active).length;
  const totalInactive = expense.length - expenseActive + (income.length - incomeActive);

  const selectedPreview = React.useMemo(() => {
    const sorted = [...selectedCategories].sort((a, b) => a.name.localeCompare(b.name));
    return { shown: sorted.slice(0, 10), remaining: Math.max(0, sorted.length - 10) };
  }, [selectedCategories]);

  const kindPill = selectedKind ? (selectedKind === "expense" ? "Expense" : "Income") : "Mixed types";

  return (
    <div className="h-[calc(100dvh-7.25rem)] rounded-3xl border border-border/60 bg-card/50 p-4 shadow-soft-lg flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {selectedCount ? "Selection" : "Overview"}
          </div>
          <div className="mt-1 text-lg font-semibold tracking-tight">
            {selectedCount ? `${selectedCount} selected` : "Make categories work for you"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {selectedCount
              ? `${kindPill} • Bulk actions live here on wide screens.`
              : "Select a category to inspect details. Drag-and-drop to set parents."}
          </div>
        </div>
        {selectedCount ? (
          <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={onClearSelection}>
            Clear
          </Button>
        ) : null}
      </div>

      <Separator className="my-4" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
        {selectedCount ? (
          <>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Bulk actions</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={bulkBusy || !selectedKind}
                  title={bulkMoveSelectionError ?? undefined}
                  onClick={onOpenBulkMove}
                >
                  Move to parent…
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled title="Merge isn’t supported yet">
                  Merge…
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={bulkBusy} onClick={onBulkArchiveRestore}>
                  {archiveNextActive ? "Restore" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={bulkBusy || Boolean(deleteDisabledReason)}
                  title={deleteDisabledReason ?? undefined}
                  onClick={onOpenDelete}
                >
                  Delete…
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Tip: Shift-click selects ranges; Cmd/Ctrl-click toggles individual rows.
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Selected</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedPreview.shown.map((c) => (
                  <Badge key={c.id} variant="subtle">
                    {c.name}
                  </Badge>
                ))}
                {selectedPreview.remaining ? <Badge variant="subtle">+{selectedPreview.remaining} more</Badge> : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Expenses</div>
                <div className="mt-1 text-sm font-semibold">{expense.length}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{expenseActive} active</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Income</div>
                <div className="mt-1 text-sm font-semibold">{income.length}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{incomeActive} active</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Health</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {totalInactive ? (
                  <span>
                    {totalInactive} inactive categor{totalInactive === 1 ? "y" : "ies"} (hidden in pickers)
                  </span>
                ) : (
                  <span>All categories are active</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
              <div>
                <div className="text-sm font-semibold tracking-tight">Quick add</div>
                <div className="text-xs text-muted-foreground">Create a top-level category.</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => onQuickAdd("expense")}>
                  <Plus className="h-4 w-4" />
                  Expense
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onQuickAdd("income")}>
                  <Plus className="h-4 w-4" />
                  Income
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/20 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Tips</div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>Drag a category onto another to set its parent.</li>
                <li>Search filters the tree and shows ancestors for context.</li>
                <li>Use “Show IDs” when integrating with imports/exports.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const categoriesQuery = useCategoriesQuery();
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const query = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const qc = useQueryClient();

  const [showIds, setShowIds] = useLocalStorageBoolean("budget.categories.showIds", false);
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => new Set());

  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = React.useState<"create" | "edit">("create");
  const [createKind, setCreateKind] = React.useState<CategoryKind>("expense");
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [primaryId, setPrimaryId] = React.useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [anchorByKind, setAnchorByKind] = React.useState<Record<CategoryKind, string | null>>({
    expense: null,
    income: null,
  });
  const [focusedByKind, setFocusedByKind] = React.useState<Record<CategoryKind, string | null>>({
    expense: null,
    income: null,
  });

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; valid: boolean } | null>(null);

  const [bulkMoveOpen, setBulkMoveOpen] = React.useState(false);
  const [bulkMoveParentId, setBulkMoveParentId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const deleteCategory = useDeleteCategoryMutation();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteIds, setDeleteIds] = React.useState<string[]>([]);
  const [deleteKind, setDeleteKind] = React.useState<CategoryKind | null>(null);
  const [deleteReassignToId, setDeleteReassignToId] = React.useState<string | null>(null);

  const categories = categoriesQuery.data ?? [];
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const selectedCategories = React.useMemo(
    () => categories.filter((c) => selectedIds.has(c.id)),
    [categories, selectedIds],
  );
  const selectedCount = selectedCategories.length;
  const selectedKind =
    new Set(selectedCategories.map((c) => c.kind)).size === 1 ? selectedCategories[0]?.kind : null;
  const archiveNextActive = selectedCount ? selectedCategories.every((c) => !c.active) : true;

  const primaryCategory = React.useMemo(() => {
    if (primaryId && selectedIds.has(primaryId)) return categories.find((c) => c.id === primaryId) ?? null;
    if (selectedCategories.length === 1) return selectedCategories[0] ?? null;
    return null;
  }, [categories, primaryId, selectedCategories, selectedIds]);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    setPrimaryId(null);
    setInspectorOpen(false);
    setAnchorByKind({ expense: null, income: null });
  }, []);

  const bulkMoveOptions = React.useMemo(() => {
    if (!selectedKind) return [];
    const candidates = categories
      .filter((c) => c.kind === selectedKind)
      .filter((c) => !selectedIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return candidates.filter((parent) =>
      selectedCategories.every((child) =>
        validateCategoryMove({ categories, categoryId: child.id, newParentId: parent.id }).ok,
      ),
    );
  }, [categories, selectedCategories, selectedIds, selectedKind]);

  const bulkMoveSelectionError = React.useMemo(() => {
    if (!selectedCount) return null;
    if (!selectedKind) return "Select categories of a single type (Expense or Income) to move together.";
    return null;
  }, [selectedCount, selectedKind]);

  const bulkMoveParentError = React.useMemo(() => {
    if (!selectedCount) return null;
    if (!selectedKind) return null; // selection error explains
    for (const c of selectedCategories) {
      const v = validateCategoryMove({ categories, categoryId: c.id, newParentId: bulkMoveParentId });
      if (!v.ok) return categoryMoveErrorMessage(v) ?? "Invalid move";
    }
    return null;
  }, [bulkMoveParentId, categories, selectedCategories, selectedCount, selectedKind]);

  const deleteDisabledReason = React.useMemo(() => {
    if (!selectedCount) return null;
    if (!selectedKind) return "Select categories of a single type (Expense or Income) to delete together.";
    const blocked = selectedIds;
    const hasTarget = categories.some((c) => c.active && c.kind === selectedKind && !blocked.has(c.id));
    if (!hasTarget) return "Create (or restore) another category first so transactions can be reassigned.";
    return null;
  }, [categories, selectedCount, selectedIds, selectedKind]);

  const openDeleteDialog = React.useCallback(
    (ids: string[], kind: CategoryKind) => {
      const blocked = new Set(ids);
      const options = categories
        .filter((c) => c.active)
        .filter((c) => c.kind === kind)
        .filter((c) => !blocked.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));

      setDeleteIds(ids);
      setDeleteKind(kind);
      setDeleteReassignToId(options[0]?.id ?? null);
      setDeleteOpen(true);
    },
    [categories],
  );

  const deleteReassignOptions = React.useMemo(() => {
    if (!deleteKind) return [];
    const blocked = new Set(deleteIds);
    return categories
      .filter((c) => c.active)
      .filter((c) => c.kind === deleteKind)
      .filter((c) => !blocked.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, deleteIds, deleteKind]);

  const deleteDialogError = React.useMemo(() => {
    if (!deleteIds.length) return "Select at least one category to delete.";
    if (!deleteKind) return "Select categories of a single type (Expense or Income).";
    if (!deleteReassignOptions.length)
      return "Create (or restore) another category first so transactions can be reassigned.";
    if (!deleteReassignToId) return "Choose a category to reassign transactions to.";
    if (deleteIds.includes(deleteReassignToId)) return "Choose a different category to reassign to.";
    return null;
  }, [deleteIds, deleteKind, deleteReassignOptions.length, deleteReassignToId]);

  const confirmDelete = React.useCallback(async () => {
    if (deleteDialogError) return;
    if (!deleteReassignToId) return;
    if (!deleteIds.length) return;

    setBulkBusy(true);
    try {
      for (const id of deleteIds) {
        await deleteCategory.mutateAsync({ id, reassignToCategoryId: deleteReassignToId });
      }
      toast.success(deleteIds.length === 1 ? "Category deleted" : `Deleted ${deleteIds.length} categories`);
      setDeleteOpen(false);
      setDeleteIds([]);
      setDeleteKind(null);
      setDeleteReassignToId(null);
      clearSelection();
    } catch {
      // error toast is handled by the mutation's onError
    } finally {
      setBulkBusy(false);
    }
  }, [clearSelection, deleteCategory, deleteDialogError, deleteIds, deleteReassignToId]);

  // Keep selection sane across refetches.
  React.useEffect(() => {
    if (!categories.length) return;
    const idSet = new Set(categories.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (idSet.has(id)) next.add(id);
      return next;
    });
  }, [categories]);

  React.useEffect(() => {
    if (!primaryId) return;
    if (selectedIds.has(primaryId)) return;
    if (selectedIds.size === 1) {
      setPrimaryId(Array.from(selectedIds)[0] ?? null);
      return;
    }
    setPrimaryId(null);
  }, [primaryId, selectedIds]);

  React.useEffect(() => {
    if (!primaryCategory) setInspectorOpen(false);
  }, [primaryCategory?.id]);

  const openCreateDialog = React.useCallback((kind: CategoryKind) => {
    setCreateKind(kind);
    setCategoryDialogMode("create");
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  }, []);

  const openEditDialog = React.useCallback((c: Category) => {
    setCategoryDialogMode("edit");
    setEditingCategory(c);
    setCategoryDialogOpen(true);
  }, []);

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFocusRow(kind: CategoryKind, id: string) {
    setFocusedByKind((prev) => ({ ...prev, [kind]: id }));
  }

  function onSelectRow(
    c: Category,
    opts: { toggle: boolean; range: boolean; kind: CategoryKind; orderedIds: string[] },
  ) {
    const { toggle, range, kind, orderedIds } = opts;
    const anchor = anchorByKind[kind] ?? c.id;
    const hasAnchor = Boolean(anchorByKind[kind]);

    let next = new Set(selectedIds);
    if (range) {
      const aIdx = orderedIds.indexOf(anchor);
      const bIdx = orderedIds.indexOf(c.id);
      if (aIdx >= 0 && bIdx >= 0) {
        const [start, end] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        const ids = orderedIds.slice(start, end + 1);
        if (toggle) for (const id of ids) next.add(id);
        else next = new Set(ids);
      } else {
        next = new Set([c.id]);
      }
      // If shift-click is the first selection, establish the anchor.
      if (!hasAnchor) setAnchorByKind((prev) => ({ ...prev, [kind]: c.id }));
    } else if (toggle) {
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      setAnchorByKind((prev) => ({ ...prev, [kind]: c.id }));
    } else {
      next = new Set([c.id]);
      setAnchorByKind((prev) => ({ ...prev, [kind]: c.id }));
    }

    setSelectedIds(next);
    setFocusedByKind((prev) => ({ ...prev, [kind]: c.id }));
    setPrimaryId(() => {
      if (next.has(c.id)) return c.id;
      if (next.size === 1) return Array.from(next)[0] ?? null;
      return null;
    });
  }

  function onDragStartRow(id: string, e: React.DragEvent<HTMLDivElement>) {
    setDraggingId(id);
    setDropTarget(null);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverRow(targetId: string, e: React.DragEvent<HTMLDivElement>) {
    if (!draggingId) return;
    if (draggingId === targetId) return;
    e.preventDefault();
    const v = validateCategoryMove({ categories, categoryId: draggingId, newParentId: targetId });
    e.dataTransfer.dropEffect = v.ok ? "move" : "none";
    setDropTarget((prev) => {
      if (prev?.id === targetId && prev.valid === v.ok) return prev;
      return { id: targetId, valid: v.ok };
    });
  }

  async function onDropRow(targetId: string, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dragId = draggingId ?? e.dataTransfer.getData("text/plain");
    setDropTarget(null);
    setDraggingId(null);
    if (!dragId) return;
    if (dragId === targetId) return;

    const v = validateCategoryMove({ categories, categoryId: dragId, newParentId: targetId });
    if (!v.ok) {
      toast.error(categoryMoveErrorMessage(v) ?? "Invalid move");
      return;
    }

    try {
      await api.updateCategory(dragId, { parentId: targetId });
      await qc.invalidateQueries({ queryKey: qk.categories() });
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId); // ensure destination is expanded
        return next;
      });
      toast.success("Moved category");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Move failed";
      toast.error(message);
    }
  }

  function onDragEndRow() {
    setDropTarget(null);
    setDraggingId(null);
  }

  async function bulkSetActive(nextActive: boolean) {
    if (!selectedCount) return;
    if (!nextActive) {
      const ok = window.confirm(`Archive ${selectedCount} categor${selectedCount === 1 ? "y" : "ies"}?`);
      if (!ok) return;
    }
    setBulkBusy(true);
    try {
      for (const c of selectedCategories) {
        await api.updateCategory(c.id, { active: nextActive });
      }
      await qc.invalidateQueries({ queryKey: qk.categories() });
      toast.success(nextActive ? "Categories restored" : "Categories archived");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk update failed";
      toast.error(message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkMoveToParent(newParentId: string | null) {
    if (!selectedCount) return;
    setBulkBusy(true);
    try {
      for (const c of selectedCategories) {
        const v = validateCategoryMove({ categories, categoryId: c.id, newParentId });
        if (!v.ok) {
          toast.error(categoryMoveErrorMessage(v) ?? "Invalid move");
          return;
        }
      }

      for (const c of selectedCategories) {
        await api.updateCategory(c.id, { parentId: newParentId });
      }
      await qc.invalidateQueries({ queryKey: qk.categories() });
      if (newParentId) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(newParentId);
          return next;
        });
      }
      toast.success("Categories moved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk move failed";
      toast.error(message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Categories</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">Organize your money</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Use parents for structure (e.g., Food → Groceries).
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="md" aria-label="Advanced category settings">
                <MoreHorizontal className="h-4 w-4" />
                Advanced
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Advanced</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showIds} onCheckedChange={(v) => setShowIds(Boolean(v))}>
                Show IDs in list
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => {
              openCreateDialog("expense");
            }}
          >
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        </div>
      </div>

      {categoriesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_440px]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
          <Skeleton className="hidden h-[420px] xl:block" />
        </div>
      ) : categoriesQuery.isError ? (
        <div className="rounded-3xl border border-border/60 bg-card/50 p-6 shadow-soft-lg">
          <div className="text-sm font-semibold">Couldn't load categories</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Try again, or switch API mode back to mock.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_440px]">
          <CategoryGroup
            title="Expenses"
            kind="expense"
            categories={expense}
            collapsedIds={collapsedIds}
            onToggleCollapsed={toggleCollapsed}
            selectedIds={selectedIds}
            activeId={primaryCategory?.kind === "expense" ? primaryCategory.id : null}
            focusedId={focusedByKind.expense}
            query={query}
            showIds={showIds}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onSelectRow={onSelectRow}
            onEditRow={openEditDialog}
            onQuickAdd={(k) => {
              openCreateDialog(k);
            }}
            onFocusRow={onFocusRow}
            onDragStartRow={onDragStartRow}
            onDragOverRow={onDragOverRow}
            onDropRow={onDropRow}
            onDragEndRow={onDragEndRow}
          />
          <CategoryGroup
            title="Income"
            kind="income"
            categories={income}
            collapsedIds={collapsedIds}
            onToggleCollapsed={toggleCollapsed}
            selectedIds={selectedIds}
            activeId={primaryCategory?.kind === "income" ? primaryCategory.id : null}
            focusedId={focusedByKind.income}
            query={query}
            showIds={showIds}
            draggingId={draggingId}
            dropTarget={dropTarget}
            onSelectRow={onSelectRow}
            onEditRow={openEditDialog}
            onQuickAdd={(k) => {
              openCreateDialog(k);
            }}
            onFocusRow={onFocusRow}
            onDragStartRow={onDragStartRow}
            onDragOverRow={onDragOverRow}
            onDropRow={onDropRow}
            onDragEndRow={onDragEndRow}
          />

          <div className="hidden xl:block">
            <AnimatePresence mode="wait" initial={false}>
              {selectedCount === 1 && primaryCategory ? (
                <motion.div
                  key={`inspector:${primaryCategory.id}`}
                  initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 14 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <CategoryInspectorPanel
                    category={primaryCategory}
                    allCategories={categories}
                    from={from}
                    to={to}
                    onClose={clearSelection}
                    onRequestDelete={() => openDeleteDialog([primaryCategory.id], primaryCategory.kind)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="sidepanel"
                  initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 14 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <CategoriesSidePanel
                    expense={expense}
                    income={income}
                    selectedCategories={selectedCategories}
                    selectedKind={selectedKind}
                    bulkBusy={bulkBusy}
                    archiveNextActive={archiveNextActive}
                    bulkMoveSelectionError={bulkMoveSelectionError}
                    deleteDisabledReason={deleteDisabledReason}
                    onOpenBulkMove={() => {
                      if (!selectedKind) return;
                      setBulkMoveParentId(null);
                      setBulkMoveOpen(true);
                    }}
                    onOpenDelete={() => {
                      if (!selectedKind) return;
                      openDeleteDialog(Array.from(selectedIds), selectedKind);
                    }}
                    onBulkArchiveRestore={() => bulkSetActive(archiveNextActive)}
                    onClearSelection={clearSelection}
                    onQuickAdd={(k) => openCreateDialog(k)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {selectedCount ? (
        <div className="sticky bottom-4 z-10 xl:hidden">
          <div className="rounded-3xl border border-border/60 bg-background/60 p-3 shadow-soft-lg backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {selectedCount} selected
                {selectedKind ? (
                  <span className="ml-2 rounded-lg border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {selectedKind === "expense" ? "Expense" : "Income"}
                  </span>
                ) : (
                  <span className="ml-2 text-[11px] text-muted-foreground">Mixed types</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedCount === 1 && primaryCategory ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={bulkBusy}
                    onClick={() => setInspectorOpen(true)}
                    aria-label="Open category details"
                  >
                    Details…
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={bulkBusy || !selectedKind}
                  title={bulkMoveSelectionError ?? undefined}
                  onClick={() => {
                    if (!selectedKind) return;
                    setBulkMoveParentId(null);
                    setBulkMoveOpen(true);
                  }}
                >
                  Move to parent…
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled title="Merge isn’t supported yet">
                  Merge…
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => bulkSetActive(archiveNextActive)}
                >
                  {archiveNextActive ? "Restore" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={bulkBusy || Boolean(deleteDisabledReason)}
                  title={deleteDisabledReason ?? undefined}
                  onClick={() => {
                    if (!selectedKind) return;
                    openDeleteDialog(Array.from(selectedIds), selectedKind);
                  }}
                >
                  Delete…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => {
                    clearSelection();
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={bulkMoveOpen}
        onOpenChange={(v) => {
          setBulkMoveOpen(v);
          if (v) setBulkMoveParentId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move to parent</DialogTitle>
            <DialogDescription>
              Choose a new parent for the selected categories. (Drag-and-drop works too.)
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            {bulkMoveSelectionError ? (
              <div className="rounded-2xl border border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
                {bulkMoveSelectionError}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Parent</Label>
                <Select
                  value={bulkMoveParentId ?? "none"}
                  onValueChange={(v) => setBulkMoveParentId(v === "none" ? null : v)}
                >
                  <SelectTrigger aria-label="Select parent for bulk move">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {bulkMoveOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {bulkMoveParentError ? <div className="text-xs text-danger">{bulkMoveParentError}</div> : null}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={bulkBusy} onClick={() => setBulkMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={bulkBusy || Boolean(bulkMoveSelectionError) || Boolean(bulkMoveParentError)}
              onClick={async () => {
                await bulkMoveToParent(bulkMoveParentId);
                setBulkMoveOpen(false);
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v);
          if (!v) {
            setDeleteIds([]);
            setDeleteKind(null);
            setDeleteReassignToId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete categor{deleteIds.length === 1 ? "y" : "ies"}</DialogTitle>
            <DialogDescription>
              Transactions in the deleted categor{deleteIds.length === 1 ? "y" : "ies"} will be reassigned before
              deletion.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/30 p-3 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground/90">
                You’re deleting {deleteIds.length || 0} categor{deleteIds.length === 1 ? "y" : "ies"}.
              </div>
              <div className="mt-1">
                Required: choose a replacement category so historical transactions remain categorized.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reassign transactions to</Label>
              <Select
                value={deleteReassignToId ?? ""}
                onValueChange={(v) => setDeleteReassignToId(v || null)}
              >
                <SelectTrigger aria-label="Select category to reassign transactions to">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {deleteReassignOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deleteDialogError ? <div className="text-xs text-danger">{deleteDialogError}</div> : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={bulkBusy} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkBusy || Boolean(deleteDialogError)}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) setEditingCategory(null);
        }}
        mode={categoryDialogMode}
        initial={categoryDialogMode === "edit" ? editingCategory ?? undefined : undefined}
        defaultKind={categoryDialogMode === "create" ? createKind : undefined}
      />

      {primaryCategory ? (
        <CategoryInspectorSheet
          open={inspectorOpen}
          category={primaryCategory}
          allCategories={categories}
          from={from}
          to={to}
          onClose={() => setInspectorOpen(false)}
          onRequestDelete={() => openDeleteDialog([primaryCategory.id], primaryCategory.kind)}
        />
      ) : null}
    </div>
  );
}
