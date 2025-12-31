from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_budgets_service
from app.core.errors import NotFoundError
from app.models.schemas import BudgetOut, BudgetUpsert, OkResponse
from app.services.budgets_service import BudgetsService

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("/overall", response_model=BudgetOut)
async def get_overall_budget(
    month: str = Query(..., description="YYYY-MM"),
    svc: BudgetsService = Depends(get_budgets_service),
) -> BudgetOut:
    b = await svc.get_overall(month)
    if not b:
        raise NotFoundError("Budget not found", details={"month": month})
    return b


@router.put("/overall", response_model=BudgetOut)
async def upsert_overall_budget(
    payload: BudgetUpsert,
    svc: BudgetsService = Depends(get_budgets_service),
) -> BudgetOut:
    return await svc.upsert_overall(payload.month, payload.budget_cents)


@router.delete("/overall", response_model=OkResponse)
async def delete_overall_budget(
    month: str = Query(..., description="YYYY-MM"),
    svc: BudgetsService = Depends(get_budgets_service),
) -> OkResponse:
    await svc.delete_overall(month)
    return OkResponse()





