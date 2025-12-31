from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import pandas as pd
from starlette.concurrency import run_in_threadpool

from app.core.errors import BadRequestError
from app.models.schemas import BudgetOut
from app.storage.csv_repo import CsvRepo
from app.storage.migrations import BUDGETS_COLUMNS, BUDGETS_DEFAULTS


def _validate_month(month: str) -> str:
    m = (month or "").strip()
    if not m:
        raise BadRequestError("month is required")
    # Validate format + range by parsing (e.g. rejects 2025-13).
    try:
        datetime.strptime(f"{m}-01", "%Y-%m-%d")
    except Exception as e:
        raise BadRequestError("Invalid month format (expected YYYY-MM).", details={"month": month}) from e
    return m


def _parse_int(v: Any) -> int:
    if v is None:
        return 0
    s = str(v).strip()
    if s == "":
        return 0
    try:
        return int(s)
    except Exception:
        # Be resilient to legacy/dirty CSV values like "123.0".
        try:
            return int(float(s))
        except Exception:
            return 0


@dataclass
class BudgetsService:
    """
    Budgets are stored in `budgets.csv` as rows:
      - month (YYYY-MM)
      - category_id
      - budget_cents

    We reserve `category_id == ""` for the overall monthly expense budget.
    """

    repo: CsvRepo

    async def get_overall(self, month: str) -> Optional[BudgetOut]:
        return await run_in_threadpool(self._get_overall_sync, month)

    def _get_overall_sync(self, month: str) -> Optional[BudgetOut]:
        m = _validate_month(month)
        df = self.repo.read_csv(self.repo.budgets_path, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS)
        if df.empty:
            return None

        df2 = df.copy()
        df2["month"] = df2["month"].astype(str)
        df2["category_id"] = df2["category_id"].fillna("").astype(str)

        mask = (df2["month"] == m) & (df2["category_id"] == "")
        if not bool(mask.any()):
            return None

        # If duplicates exist, treat the last row as authoritative (upsert will de-dupe).
        row = df2.loc[mask].iloc[-1].to_dict()
        budget_cents = _parse_int(row.get("budget_cents"))
        return BudgetOut(month=m, category_id="", budget_cents=int(budget_cents))

    async def upsert_overall(self, month: str, budget_cents: int) -> BudgetOut:
        return await run_in_threadpool(self._upsert_overall_sync, month, budget_cents)

    def _upsert_overall_sync(self, month: str, budget_cents: int) -> BudgetOut:
        m = _validate_month(month)
        try:
            cents = int(budget_cents)
        except Exception as e:
            raise BadRequestError("budget_cents must be an integer", details={"budget_cents": budget_cents}) from e
        if cents < 0:
            raise BadRequestError("budget_cents must be non-negative", details={"budget_cents": cents})

        df = self.repo.read_csv(self.repo.budgets_path, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS)
        df2 = df.copy()
        if not df2.empty:
            df2["month"] = df2["month"].astype(str)
            df2["category_id"] = df2["category_id"].fillna("").astype(str)
            # Enforce uniqueness for (month, "") by removing existing matches.
            mask = (df2["month"] == m) & (df2["category_id"] == "")
            df2 = df2.loc[~mask].copy()

        row = {"month": m, "category_id": "", "budget_cents": str(cents)}
        df3 = pd.concat([df2, pd.DataFrame([row])], ignore_index=True).fillna("")
        self.repo.write_csv(self.repo.budgets_path, df3, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS)
        return BudgetOut(month=m, category_id="", budget_cents=cents)

    async def delete_overall(self, month: str) -> bool:
        return await run_in_threadpool(self._delete_overall_sync, month)

    def _delete_overall_sync(self, month: str) -> bool:
        m = _validate_month(month)
        df = self.repo.read_csv(self.repo.budgets_path, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS)
        if df.empty:
            return False

        df2 = df.copy()
        df2["month"] = df2["month"].astype(str)
        df2["category_id"] = df2["category_id"].fillna("").astype(str)
        mask = (df2["month"] == m) & (df2["category_id"] == "")
        if not bool(mask.any()):
            return False

        df3 = df2.loc[~mask].copy()
        self.repo.write_csv(self.repo.budgets_path, df3, columns=BUDGETS_COLUMNS, defaults=BUDGETS_DEFAULTS)
        return True





