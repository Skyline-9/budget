import type { Category, CategoryKind } from "@/types";

export type CategoryMoveValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "category_not_found"
        | "parent_not_found"
        | "self_parent"
        | "cycle"
        | "kind_mismatch";
    };

function kindLabel(kind: CategoryKind) {
  return kind === "expense" ? "Expense" : "Income";
}

export function buildCategoryIndex(categories: Category[]) {
  const byId = new Map<string, Category>();
  for (const c of categories) byId.set(c.id, c);
  return byId;
}

export function buildChildrenMap(categories: Category[]) {
  const byId = buildCategoryIndex(categories);
  const childrenByParentId = new Map<string, string[]>();
  for (const c of categories) {
    const parentId = c.parentId ?? null;
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    if (parent.kind !== c.kind) continue;
    const arr = childrenByParentId.get(parentId) ?? [];
    arr.push(c.id);
    childrenByParentId.set(parentId, arr);
  }
  return childrenByParentId;
}

export function getDescendantIds(categories: Category[], categoryId: string): Set<string> {
  const childrenByParentId = buildChildrenMap(categories);
  const out = new Set<string>();
  const visited = new Set<string>();
  const stack = [...(childrenByParentId.get(categoryId) ?? [])];

  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.add(id);
    const kids = childrenByParentId.get(id);
    if (kids) stack.push(...kids);
  }

  return out;
}

/**
 * Validates setting a category's parent.
 *
 * Tricky edge-case: we must prevent cycles (parenting a category under its own
 * descendant). This is enforced here and reused by both drag-to-nest and
 * "Move to parent" actions.
 */
export function validateCategoryMove(opts: {
  categories: Category[];
  categoryId: string;
  newParentId: string | null;
}): CategoryMoveValidation {
  const { categories, categoryId, newParentId } = opts;

  const byId = buildCategoryIndex(categories);
  const cat = byId.get(categoryId);
  if (!cat) return { ok: false, reason: "category_not_found" };

  if (!newParentId) return { ok: true };

  if (newParentId === categoryId) return { ok: false, reason: "self_parent" };

  const parent = byId.get(newParentId);
  if (!parent) return { ok: false, reason: "parent_not_found" };

  if (parent.kind !== cat.kind) return { ok: false, reason: "kind_mismatch" };

  const descendants = getDescendantIds(categories, categoryId);
  if (descendants.has(newParentId)) return { ok: false, reason: "cycle" };

  return { ok: true };
}

export function categoryMoveErrorMessage(v: CategoryMoveValidation): string | undefined {
  if (v.ok) return undefined;
  switch (v.reason) {
    case "category_not_found":
      return "Category not found.";
    case "parent_not_found":
      return "Parent category not found.";
    case "self_parent":
      return "A category can’t be its own parent.";
    case "cycle":
      return "Invalid move: that would create a cycle.";
    case "kind_mismatch":
      return `Invalid move: Expense and Income categories can’t be nested together.`;
  }
}

export function categoryKindMismatchMessage(childKind: CategoryKind, parentKind: CategoryKind) {
  if (childKind === parentKind) return undefined;
  return `Invalid move: ${kindLabel(childKind)} can’t be nested under ${kindLabel(parentKind)}.`;
}

export type CategoryTreeRow = {
  category: Category;
  depth: number;
  hasChildren: boolean;
};

/**
 * Build a stable, well-formed category tree order (parent → children) for UI.
 * Invalid or cross-kind parent links are treated as "no parent".
 */
export function buildCategoryTreeRows(categories: Category[]): CategoryTreeRow[] {
  const byId = buildCategoryIndex(categories);

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

  const rows: CategoryTreeRow[] = [];
  const visited = new Set<string>();
  const rootIds = childrenByParent.get(null) ?? [];

  function walk(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const c = byId.get(id);
    if (!c) return;

    const kids = childrenByParent.get(id) ?? [];
    rows.push({ category: c, depth, hasChildren: kids.length > 0 });
    for (const kid of kids) walk(kid, depth + 1);
  }

  for (const id of rootIds) walk(id, 0);
  return rows;
}


