from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd
from starlette.concurrency import run_in_threadpool

from app.core.errors import BadRequestError, NotFoundError
from app.models.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.storage.csv_repo import CsvRepo, utc_now_iso
from app.storage.migrations import (
    BUDGETS_COLUMNS,
    BUDGETS_DEFAULTS,
    CATEGORIES_COLUMNS,
    CATEGORIES_DEFAULTS,
    TRANSACTIONS_COLUMNS,
    TRANSACTIONS_DEFAULTS,
)


def _parse_bool(v: Any) -> bool:
    return str(v).strip().lower() in {"true", "1", "yes", "y", "t"}


def _empty_to_none(v: Any) -> Optional[str]:
    s = str(v).strip()
    return s if s else None


@dataclass
class CategoriesService:
    repo: CsvRepo

    async def list_categories(self) -> List[CategoryOut]:
        df = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        items: List[CategoryOut] = []
        for _, row in df.iterrows():
            payload: Dict[str, Any] = row.to_dict()
            payload["parent_id"] = _empty_to_none(payload.get("parent_id"))
            payload["active"] = _parse_bool(payload.get("active"))
            # timestamps are stored as ISO strings; pydantic will parse
            items.append(CategoryOut.model_validate(payload))
        return items

    async def get_category_map(self) -> Dict[str, CategoryOut]:
        cats = await self.list_categories()
        return {c.id: c for c in cats}

    async def category_exists(self, category_id: str) -> bool:
        if not category_id:
            return False
        df = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        return bool((df["id"] == category_id).any())

    async def create_category(self, payload: CategoryCreate) -> CategoryOut:
        category_id = payload.id or str(uuid.uuid4())
        now = utc_now_iso()

        df = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        if bool((df["id"] == category_id).any()):
            raise BadRequestError("Category id already exists", details={"id": category_id})

        row = {
            "id": category_id,
            "name": payload.name,
            "kind": payload.kind,
            "parent_id": payload.parent_id or "",
            "active": "true" if payload.active else "false",
            "created_at": now,
            "updated_at": now,
        }
        df2 = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        self.repo.write_csv(
            self.repo.categories_path, df2, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        return CategoryOut.model_validate({**row, "parent_id": payload.parent_id, "active": payload.active})

    async def update_category(self, category_id: str, payload: CategoryUpdate) -> CategoryOut:
        df = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        mask = df["id"] == category_id
        if not bool(mask.any()):
            raise NotFoundError("Category not found", details={"id": category_id})

        idx = df.index[mask][0]
        fields = payload.model_fields_set

        if "name" in fields:
            if payload.name is None:
                raise BadRequestError("name cannot be null")
            df.at[idx, "name"] = payload.name
        if "kind" in fields:
            if payload.kind is None:
                raise BadRequestError("kind cannot be null")
            df.at[idx, "kind"] = payload.kind
        if "parent_id" in fields:
            df.at[idx, "parent_id"] = payload.parent_id or ""
        if "active" in fields:
            if payload.active is None:
                raise BadRequestError("active cannot be null")
            df.at[idx, "active"] = "true" if payload.active else "false"

        df.at[idx, "updated_at"] = utc_now_iso()

        self.repo.write_csv(
            self.repo.categories_path, df, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )

        row = df.loc[idx].to_dict()
        row["parent_id"] = _empty_to_none(row.get("parent_id"))
        row["active"] = _parse_bool(row.get("active"))
        return CategoryOut.model_validate(row)

    async def delete_category(self, category_id: str, *, reassign_to_category_id: str) -> None:
        await run_in_threadpool(self._delete_category_sync, category_id, reassign_to_category_id)

    def _delete_category_sync(self, category_id: str, reassign_to_category_id: str) -> None:
        category_id = (category_id or "").strip()
        reassign_to_category_id = (reassign_to_category_id or "").strip()
        if not category_id:
            raise BadRequestError("category_id is required")
        if not reassign_to_category_id:
            raise BadRequestError("reassignTo is required")
        if reassign_to_category_id == category_id:
            raise BadRequestError("reassignTo cannot equal category_id")

        # Load categories.
        df_cat = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        if df_cat.empty:
            raise NotFoundError("Category not found", details={"id": category_id})

        mask_delete = df_cat["id"] == category_id
        if not bool(mask_delete.any()):
            raise NotFoundError("Category not found", details={"id": category_id})

        mask_target = df_cat["id"] == reassign_to_category_id
        if not bool(mask_target.any()):
            raise BadRequestError("Unknown reassignTo category", details={"reassignTo": reassign_to_category_id})

        delete_kind = str(df_cat.loc[mask_delete].iloc[0].get("kind") or "").strip()
        target_kind = str(df_cat.loc[mask_target].iloc[0].get("kind") or "").strip()
        if delete_kind and target_kind and delete_kind != target_kind:
            raise BadRequestError(
                "reassignTo kind mismatch",
                details={"category_id": category_id, "category_kind": delete_kind, "reassignTo_kind": target_kind},
            )

        now = utc_now_iso()

        # Reassign transactions (including deleted ones; keeps history consistent).
        df_tx = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        if not df_tx.empty:
            mask_tx = df_tx["category_id"] == category_id
            if bool(mask_tx.any()):
                df_tx.loc[mask_tx, "category_id"] = reassign_to_category_id
                df_tx.loc[mask_tx, "updated_at"] = now
                self.repo.write_csv(
                    self.repo.transactions_path,
                    df_tx,
                    columns=TRANSACTIONS_COLUMNS,
                    defaults=TRANSACTIONS_DEFAULTS,
                )

        # Reassign budgets, if present.
        df_budgets = self.repo.read_csv(
            self.repo.budgets_path, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS
        )
        if not df_budgets.empty:
            mask_b = df_budgets["category_id"] == category_id
            if bool(mask_b.any()):
                df_budgets.loc[mask_b, "category_id"] = reassign_to_category_id
                self.repo.write_csv(
                    self.repo.budgets_path,
                    df_budgets,
                    columns=BUDGETS_COLUMNS,
                    defaults=BUDGETS_DEFAULTS,
                )

        # Clear parent pointers for children so the tree stays well-formed.
        mask_children = df_cat["parent_id"] == category_id
        if bool(mask_children.any()):
            df_cat.loc[mask_children, "parent_id"] = ""
            df_cat.loc[mask_children, "updated_at"] = now

        # Remove the category.
        df_cat2 = df_cat.loc[~mask_delete].copy()
        self.repo.write_csv(
            self.repo.categories_path,
            df_cat2,
            columns=CATEGORIES_COLUMNS,
            defaults=CATEGORIES_DEFAULTS,
        )


