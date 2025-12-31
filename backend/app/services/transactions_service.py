from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, Optional

import pandas as pd
from starlette.concurrency import run_in_threadpool

from app.core.errors import BadRequestError, NotFoundError
from app.models.schemas import (
    TransactionCreate,
    TransactionListResponse,
    TransactionOut,
    TransactionUpdate,
)
from app.services.categories_service import CategoriesService
from app.storage.csv_repo import CsvRepo, utc_now_iso
from app.storage.migrations import TRANSACTIONS_COLUMNS, TRANSACTIONS_DEFAULTS


def _parse_bool(v: Any) -> bool:
    return str(v).strip().lower() in {"true", "1", "yes", "y", "t"}


def _parse_date(v: str) -> date:
    return datetime.strptime(v, "%Y-%m-%d").date()


def _df_to_transaction_out(row: Dict[str, Any]) -> TransactionOut:
    payload = dict(row)
    payload["deleted"] = _parse_bool(payload.get("deleted"))
    # Empty strings for optional fields -> None
    for k in ("merchant", "notes"):
        if k in payload and isinstance(payload[k], str) and payload[k].strip() == "":
            payload[k] = None
    return TransactionOut.model_validate(payload)


@dataclass
class TransactionsService:
    repo: CsvRepo
    categories_service: CategoriesService

    async def list_transactions(
        self,
        *,
        from_date: Optional[str],
        to_date: Optional[str],
        category_id: Optional[str],
        q: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
        sort: Optional[str],
        order: Optional[str],
        limit: int,
        offset: int,
    ) -> TransactionListResponse:
        return await run_in_threadpool(
            self._list_transactions_sync,
            from_date,
            to_date,
            category_id,
            q,
            min_amount,
            max_amount,
            sort,
            order,
            limit,
            offset,
        )

    def _list_transactions_sync(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        category_id: Optional[str],
        q: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
        sort: Optional[str],
        order: Optional[str],
        limit: int,
        offset: int,
    ) -> TransactionListResponse:
        limit = max(1, min(int(limit or 100), 1000))
        offset = max(0, int(offset or 0))

        df = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        if df.empty:
            return TransactionListResponse(items=[], total=0, limit=limit, offset=offset)

        # Coerce types
        df["deleted"] = df["deleted"].apply(_parse_bool)
        df = df[df["deleted"] == False]  # noqa: E712

        df["amount_cents"] = pd.to_numeric(df["amount_cents"], errors="coerce").fillna(0).astype("int64")
        df["date"] = pd.to_datetime(df["date"], errors="coerce", format="%Y-%m-%d")
        df = df[df["date"].notna()]

        if from_date:
            df = df[df["date"] >= pd.to_datetime(_parse_date(from_date))]
        if to_date:
            df = df[df["date"] <= pd.to_datetime(_parse_date(to_date))]
        if category_id:
            if "," in category_id:
                ids = [p.strip() for p in category_id.split(",") if p.strip()]
                if ids:
                    df = df[df["category_id"].isin(ids)]
            else:
                df = df[df["category_id"] == category_id]
        if q:
            q2 = q.strip().lower()
            if q2:
                merchant = df["merchant"].fillna("").astype(str).str.lower()
                notes = df["notes"].fillna("").astype(str).str.lower()
                df = df[merchant.str.contains(q2, na=False) | notes.str.contains(q2, na=False)]
        if min_amount is not None:
            df = df[df["amount_cents"] >= int(min_amount)]
        if max_amount is not None:
            df = df[df["amount_cents"] <= int(max_amount)]

        total = int(len(df))

        sort_field = (sort or "date").strip().lower()
        sort_map = {
            "date": "date",
            "amount_cents": "amount_cents",
            "created_at": "created_at",
            "updated_at": "updated_at",
        }
        sort_col = sort_map.get(sort_field, "date")
        asc = (order or "desc").strip().lower() == "asc"

        df = df.sort_values(by=sort_col, ascending=asc, kind="mergesort")

        df_page = df.iloc[offset : offset + limit].copy()
        # Convert date back to YYYY-MM-DD strings for API payload.
        df_page["date"] = df_page["date"].dt.strftime("%Y-%m-%d")
        items = [_df_to_transaction_out(r) for r in df_page.to_dict(orient="records")]

        return TransactionListResponse(items=items, total=total, limit=limit, offset=offset)

    async def create_transaction(self, payload: TransactionCreate) -> TransactionOut:
        return await run_in_threadpool(self._create_transaction_sync, payload)

    def _create_transaction_sync(self, payload: TransactionCreate) -> TransactionOut:
        if not payload.category_id:
            raise BadRequestError("category_id is required")

        # Validate category exists (best-effort)
        # NOTE: This reads categories from disk, but avoids a foreign key requirement.
        # For now, enforce existence to prevent dangling categories in dashboards.
        df_cat = self.repo.read_csv(
            self.repo.categories_path,
            columns=["id", "name", "kind", "parent_id", "active", "created_at", "updated_at"],
            defaults={},
        )
        if not df_cat.empty and not bool((df_cat["id"] == payload.category_id).any()):
            raise BadRequestError("Unknown category_id", details={"category_id": payload.category_id})

        tx_id = payload.id or str(uuid.uuid4())
        now = utc_now_iso()

        df = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        if not df.empty and bool((df["id"] == tx_id).any()):
            raise BadRequestError("Transaction id already exists", details={"id": tx_id})

        row = {
            "id": tx_id,
            "date": payload.date.strftime("%Y-%m-%d"),
            "amount_cents": str(int(payload.amount_cents)),
            "category_id": payload.category_id,
            "merchant": payload.merchant or "",
            "notes": payload.notes or "",
            "created_at": now,
            "updated_at": now,
            "deleted": "false",
        }
        df2 = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        self.repo.write_csv(
            self.repo.transactions_path, df2, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        return _df_to_transaction_out({**row, "amount_cents": int(payload.amount_cents)})

    async def update_transaction(self, transaction_id: str, payload: TransactionUpdate) -> TransactionOut:
        return await run_in_threadpool(self._update_transaction_sync, transaction_id, payload)

    def _update_transaction_sync(self, transaction_id: str, payload: TransactionUpdate) -> TransactionOut:
        df = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        mask = df["id"] == transaction_id
        if not bool(mask.any()):
            raise NotFoundError("Transaction not found", details={"id": transaction_id})

        idx = df.index[mask][0]
        if _parse_bool(df.at[idx, "deleted"]):
            raise NotFoundError("Transaction not found", details={"id": transaction_id})

        fields = payload.model_fields_set

        if "category_id" in fields:
            if payload.category_id is None or not payload.category_id:
                raise BadRequestError("category_id cannot be null/empty")
            df_cat = self.repo.read_csv(
                self.repo.categories_path,
                columns=["id", "name", "kind", "parent_id", "active", "created_at", "updated_at"],
                defaults={},
            )
            if not df_cat.empty and not bool((df_cat["id"] == payload.category_id).any()):
                raise BadRequestError("Unknown category_id", details={"category_id": payload.category_id})
            df.at[idx, "category_id"] = payload.category_id

        if "date" in fields:
            if payload.date is None:
                raise BadRequestError("date cannot be null")
            df.at[idx, "date"] = payload.date.strftime("%Y-%m-%d")
        if "amount_cents" in fields:
            if payload.amount_cents is None:
                raise BadRequestError("amount_cents cannot be null")
            df.at[idx, "amount_cents"] = str(int(payload.amount_cents))
        if "merchant" in fields:
            df.at[idx, "merchant"] = payload.merchant or ""
        if "notes" in fields:
            df.at[idx, "notes"] = payload.notes or ""

        df.at[idx, "updated_at"] = utc_now_iso()

        self.repo.write_csv(
            self.repo.transactions_path, df, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )

        row = df.loc[idx].to_dict()
        row["amount_cents"] = int(row.get("amount_cents") or 0)
        return _df_to_transaction_out(row)

    async def delete_transaction(self, transaction_id: str) -> TransactionOut:
        return await run_in_threadpool(self._delete_transaction_sync, transaction_id)

    def _delete_transaction_sync(self, transaction_id: str) -> TransactionOut:
        df = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        mask = df["id"] == transaction_id
        if not bool(mask.any()):
            raise NotFoundError("Transaction not found", details={"id": transaction_id})

        idx = df.index[mask][0]
        if _parse_bool(df.at[idx, "deleted"]):
            raise NotFoundError("Transaction not found", details={"id": transaction_id})

        df.at[idx, "deleted"] = "true"
        df.at[idx, "updated_at"] = utc_now_iso()

        self.repo.write_csv(
            self.repo.transactions_path, df, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )

        row = df.loc[idx].to_dict()
        row["amount_cents"] = int(row.get("amount_cents") or 0)
        return _df_to_transaction_out(row)


