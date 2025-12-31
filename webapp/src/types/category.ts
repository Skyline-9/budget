export type CategoryKind = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId?: string | null;
  active: boolean;
};

export type CategoryCreate = {
  name: string;
  kind: CategoryKind;
  parentId?: string | null;
  active: boolean;
};

export type CategoryUpdate = Partial<CategoryCreate>;










