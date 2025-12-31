from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

import pandas as pd
from starlette.concurrency import run_in_threadpool

from app.models.schemas import (
    DashboardByCategoryItem,
    DashboardByCategoryResponse,
    DashboardCategoryTrendResponse,
    DashboardCategoryTrendSeries,
    DashboardSummaryResponse,
    DashboardTrendPoint,
    DashboardTrendResponse,
)
from app.services.categories_service import CategoriesService
from app.storage.csv_repo import CsvRepo
from app.storage.migrations import (
    CATEGORIES_COLUMNS,
    CATEGORIES_DEFAULTS,
    TRANSACTIONS_COLUMNS,
    TRANSACTIONS_DEFAULTS,
)


def _parse_bool(v: Any) -> bool:
    return str(v).strip().lower() in {"true", "1", "yes", "y", "t"}


def _parse_date(v: str) -> datetime:
    return datetime.strptime(v, "%Y-%m-%d")


@dataclass
class DashboardService:
    repo: CsvRepo
    categories_service: CategoriesService

    async def summary(
        self,
        *,
        from_date: Optional[str],
        to_date: Optional[str],
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardSummaryResponse:
        return await run_in_threadpool(self._summary_sync, from_date, to_date, q, category_id, min_amount, max_amount)

    def _load_tx_df(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> pd.DataFrame:
        df = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )
        if df.empty:
            return df

        df["deleted"] = df["deleted"].apply(_parse_bool)
        df = df[df["deleted"] == False]  # noqa: E712
        if df.empty:
            return df

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

        return df

    def _summary_sync(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardSummaryResponse:
        df = self._load_tx_df(from_date, to_date, q, category_id, min_amount, max_amount)
        if df.empty:
            return DashboardSummaryResponse(income_cents=0, expense_cents=0, net_cents=0, savings_rate=None)

        income = int(df.loc[df["amount_cents"] > 0, "amount_cents"].sum())
        expense = int((-df.loc[df["amount_cents"] < 0, "amount_cents"].sum()))
        net = income - expense
        savings_rate = (net / income) if income > 0 else None
        return DashboardSummaryResponse(
            income_cents=income,
            expense_cents=expense,
            net_cents=net,
            savings_rate=savings_rate,
        )

    async def trend(
        self,
        *,
        from_date: Optional[str],
        to_date: Optional[str],
        interval: str,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardTrendResponse:
        return await run_in_threadpool(
            self._trend_sync, from_date, to_date, interval, q, category_id, min_amount, max_amount
        )

    def _trend_sync(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        interval: str,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardTrendResponse:
        interval = (interval or "month").strip().lower()
        if interval not in {"month", "day"}:
            interval = "month"

        df = self._load_tx_df(from_date, to_date, q, category_id, min_amount, max_amount)
        if df.empty:
            return DashboardTrendResponse(interval=interval, points=[])

        df = df.copy()
        if interval == "day":
            df["period"] = df["date"].dt.strftime("%Y-%m-%d")
        else:
            df["period"] = df["date"].dt.to_period("M").astype(str)

        def _income(s: pd.Series) -> int:
            return int(s[s > 0].sum())

        def _expense(s: pd.Series) -> int:
            return int((-s[s < 0].sum()))

        grouped = df.groupby("period")["amount_cents"].agg(income=_income, expense=_expense).reset_index()
        grouped = grouped.sort_values("period")

        # If we're returning daily trend, include missing days (zero values) so the
        # chart looks continuous across the selected date range.
        if interval == "day":
            start = pd.to_datetime(from_date, errors="coerce", format="%Y-%m-%d") if from_date else df["date"].min()
            end = pd.to_datetime(to_date, errors="coerce", format="%Y-%m-%d") if to_date else df["date"].max()

            if pd.isna(start):
                start = df["date"].min()
            if pd.isna(end):
                end = df["date"].max()

            full_days = pd.date_range(start=start, end=end, freq="D").strftime("%Y-%m-%d")
            grouped = (
                grouped.set_index("period")
                .reindex(full_days, fill_value=0)
                .reset_index()
                .rename(columns={"index": "period"})
            )

        grouped["net"] = grouped["income"] - grouped["expense"]

        points = [
            DashboardTrendPoint(
                period=row["period"],
                income_cents=int(row["income"]),
                expense_cents=int(row["expense"]),
                net_cents=int(row["net"]),
            )
            for row in grouped.to_dict(orient="records")
        ]
        return DashboardTrendResponse(interval=interval, points=points)

    async def by_category(
        self,
        *,
        from_date: Optional[str],
        to_date: Optional[str],
        kind: str,
        limit: int,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardByCategoryResponse:
        return await run_in_threadpool(
            self._by_category_sync, from_date, to_date, kind, limit, q, category_id, min_amount, max_amount
        )

    def _by_category_sync(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        kind: str,
        limit: int,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardByCategoryResponse:
        kind2 = "expense" if kind != "income" else "income"
        limit = max(1, min(int(limit or 10), 100))

        tx = self._load_tx_df(from_date, to_date, q, category_id, min_amount, max_amount)
        if tx.empty:
            return DashboardByCategoryResponse(kind=kind2, items=[])

        cats = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        cat_map: Dict[str, Dict[str, Any]] = {}
        if not cats.empty:
            for _, row in cats.iterrows():
                r = row.to_dict()
                cat_map[str(r.get("id"))] = {"name": r.get("name") or "", "kind": r.get("kind") or "expense"}

        # Filter by kind using category mapping where possible.
        if cat_map:
            tx = tx[tx["category_id"].apply(lambda cid: cat_map.get(str(cid), {}).get("kind") == kind2)]

        if tx.empty:
            return DashboardByCategoryResponse(kind=kind2, items=[])

        tx = tx.copy()
        if kind2 == "expense":
            tx = tx[tx["amount_cents"] < 0]
            tx["abs_cents"] = (-tx["amount_cents"]).astype("int64")
            totals = tx.groupby("category_id")["abs_cents"].sum().reset_index()
            totals = totals.rename(columns={"abs_cents": "total_cents"})
        else:
            tx = tx[tx["amount_cents"] > 0]
            totals = tx.groupby("category_id")["amount_cents"].sum().reset_index()
            totals = totals.rename(columns={"amount_cents": "total_cents"})

        totals = totals.sort_values("total_cents", ascending=False).head(limit)

        items = []
        for row in totals.to_dict(orient="records"):
            cid = str(row["category_id"])
            name = cat_map.get(cid, {}).get("name") or "Unknown"
            items.append(
                DashboardByCategoryItem(
                    category_id=cid,
                    category_name=name,
                    total_cents=int(row["total_cents"]),
                )
            )

        return DashboardByCategoryResponse(kind=kind2, items=items)

    async def category_trend(
        self,
        *,
        from_date: Optional[str],
        to_date: Optional[str],
        kind: str,
        limit: int,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardCategoryTrendResponse:
        return await run_in_threadpool(
            self._category_trend_sync,
            from_date,
            to_date,
            kind,
            limit,
            q,
            category_id,
            min_amount,
            max_amount,
        )

    def _category_trend_sync(
        self,
        from_date: Optional[str],
        to_date: Optional[str],
        kind: str,
        limit: int,
        q: Optional[str],
        category_id: Optional[str],
        min_amount: Optional[int],
        max_amount: Optional[int],
    ) -> DashboardCategoryTrendResponse:
        kind2 = "expense" if kind != "income" else "income"
        limit = max(1, min(int(limit or 8), 50))

        tx = self._load_tx_df(from_date, to_date, q, category_id, min_amount, max_amount)
        if tx.empty:
            return DashboardCategoryTrendResponse(interval="month", kind=kind2, periods=[], series=[])

        # Category name mapping
        cats = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        cat_map: Dict[str, Dict[str, Any]] = {}
        if not cats.empty:
            for _, row in cats.iterrows():
                r = row.to_dict()
                cat_map[str(r.get("id"))] = {"name": r.get("name") or "", "kind": r.get("kind") or "expense"}

        tx = tx.copy()
        tx["category_id"] = tx["category_id"].astype(str)

        # Filter + normalize cents so values are positive for both kinds.
        if kind2 == "expense":
            tx = tx[tx["amount_cents"] < 0].copy()
            tx["metric_cents"] = (-tx["amount_cents"]).astype("int64")
        else:
            tx = tx[tx["amount_cents"] > 0].copy()
            tx["metric_cents"] = tx["amount_cents"].astype("int64")

        if tx.empty:
            return DashboardCategoryTrendResponse(interval="month", kind=kind2, periods=[], series=[])

        # Determine month range (include missing months so the chart can scroll smoothly).
        start = pd.to_datetime(from_date, errors="coerce", format="%Y-%m-%d") if from_date else tx["date"].min()
        end = pd.to_datetime(to_date, errors="coerce", format="%Y-%m-%d") if to_date else tx["date"].max()
        if pd.isna(start):
            start = tx["date"].min()
        if pd.isna(end):
            end = tx["date"].max()

        periods = pd.period_range(start=start, end=end, freq="M").astype(str).tolist()

        # Pick top categories by total over the range.
        totals = tx.groupby("category_id")["metric_cents"].sum().sort_values(ascending=False).head(limit)
        top_ids = [str(x) for x in totals.index.tolist()]

        # Monthly breakdown for top categories.
        tx["period"] = tx["date"].dt.to_period("M").astype(str)
        top_tx = tx[tx["category_id"].isin(top_ids)]

        pivot = (
            top_tx.pivot_table(
                index="period",
                columns="category_id",
                values="metric_cents",
                aggfunc="sum",
                fill_value=0,
            )
            .reindex(periods, fill_value=0)
        )

        series: list[DashboardCategoryTrendSeries] = []
        for cid in top_ids:
            values = (
                pivot[cid].astype("int64").tolist()
                if cid in pivot.columns
                else [0 for _ in range(len(periods))]
            )
            name = cat_map.get(cid, {}).get("name") or "Unknown"
            series.append(
                DashboardCategoryTrendSeries(
                    category_id=cid,
                    category_name=name,
                    total_cents=int(totals.get(cid, 0)),
                    values_cents=[int(v) for v in values],
                )
            )

        return DashboardCategoryTrendResponse(interval="month", kind=kind2, periods=periods, series=series)


