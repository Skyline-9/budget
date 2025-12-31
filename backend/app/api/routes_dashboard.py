from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_dashboard_service
from app.models.schemas import (
    DashboardByCategoryResponse,
    DashboardCategoryTrendResponse,
    DashboardSummaryResponse,
    DashboardTrendResponse,
)
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    category_id_csv: Optional[str] = Query(default=None, alias="categoryId"),
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    min_amount_cents: Optional[int] = Query(default=None, alias="minAmountCents"),
    max_amount_cents: Optional[int] = Query(default=None, alias="maxAmountCents"),
    svc: DashboardService = Depends(get_dashboard_service),
) -> DashboardSummaryResponse:
    category = category_id or category_id_csv
    min_a = min_amount if min_amount is not None else min_amount_cents
    max_a = max_amount if max_amount is not None else max_amount_cents
    return await svc.summary(from_date=from_date, to_date=to_date, q=q, category_id=category, min_amount=min_a, max_amount=max_a)


@router.get("/trend", response_model=DashboardTrendResponse)
async def dashboard_trend(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    category_id_csv: Optional[str] = Query(default=None, alias="categoryId"),
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    min_amount_cents: Optional[int] = Query(default=None, alias="minAmountCents"),
    max_amount_cents: Optional[int] = Query(default=None, alias="maxAmountCents"),
    interval: str = "month",
    svc: DashboardService = Depends(get_dashboard_service),
) -> DashboardTrendResponse:
    category = category_id or category_id_csv
    min_a = min_amount if min_amount is not None else min_amount_cents
    max_a = max_amount if max_amount is not None else max_amount_cents
    return await svc.trend(from_date=from_date, to_date=to_date, interval=interval, q=q, category_id=category, min_amount=min_a, max_amount=max_a)


@router.get("/by-category", response_model=DashboardByCategoryResponse)
async def dashboard_by_category(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    category_id_csv: Optional[str] = Query(default=None, alias="categoryId"),
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    min_amount_cents: Optional[int] = Query(default=None, alias="minAmountCents"),
    max_amount_cents: Optional[int] = Query(default=None, alias="maxAmountCents"),
    kind: str = "expense",
    limit: int = 10,
    svc: DashboardService = Depends(get_dashboard_service),
) -> DashboardByCategoryResponse:
    category = category_id or category_id_csv
    min_a = min_amount if min_amount is not None else min_amount_cents
    max_a = max_amount if max_amount is not None else max_amount_cents
    return await svc.by_category(from_date=from_date, to_date=to_date, kind=kind, limit=limit, q=q, category_id=category, min_amount=min_a, max_amount=max_a)


@router.get("/category-trend", response_model=DashboardCategoryTrendResponse)
async def dashboard_category_trend(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    q: Optional[str] = None,
    category_id: Optional[str] = None,
    category_id_csv: Optional[str] = Query(default=None, alias="categoryId"),
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    min_amount_cents: Optional[int] = Query(default=None, alias="minAmountCents"),
    max_amount_cents: Optional[int] = Query(default=None, alias="maxAmountCents"),
    kind: str = "expense",
    limit: int = 8,
    svc: DashboardService = Depends(get_dashboard_service),
) -> DashboardCategoryTrendResponse:
    category = category_id or category_id_csv
    min_a = min_amount if min_amount is not None else min_amount_cents
    max_a = max_amount if max_amount is not None else max_amount_cents
    return await svc.category_trend(
        from_date=from_date,
        to_date=to_date,
        kind=kind,
        limit=limit,
        q=q,
        category_id=category,
        min_amount=min_a,
        max_amount=max_a,
    )


