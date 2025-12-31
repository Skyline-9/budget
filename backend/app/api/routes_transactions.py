from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_transactions_service
from app.models.schemas import (
    TransactionCreate,
    TransactionListResponse,
    TransactionOut,
    TransactionUpdate,
)
from app.services.transactions_service import TransactionsService

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    category_id: Optional[str] = None,
    category_id_csv: Optional[str] = Query(default=None, alias="categoryId"),
    q: Optional[str] = None,
    min_amount: Optional[int] = None,
    max_amount: Optional[int] = None,
    min_amount_cents: Optional[int] = Query(default=None, alias="minAmountCents"),
    max_amount_cents: Optional[int] = Query(default=None, alias="maxAmountCents"),
    sort: Optional[str] = "date",
    order: Optional[str] = "desc",
    limit: int = 100,
    offset: int = 0,
    svc: TransactionsService = Depends(get_transactions_service),
) -> TransactionListResponse:
    category = category_id or category_id_csv
    min_a = min_amount if min_amount is not None else min_amount_cents
    max_a = max_amount if max_amount is not None else max_amount_cents
    return await svc.list_transactions(
        from_date=from_date,
        to_date=to_date,
        category_id=category,
        q=q,
        min_amount=min_a,
        max_amount=max_a,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TransactionOut)
async def create_transaction(
    payload: TransactionCreate,
    svc: TransactionsService = Depends(get_transactions_service),
) -> TransactionOut:
    return await svc.create_transaction(payload)


@router.put("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    svc: TransactionsService = Depends(get_transactions_service),
) -> TransactionOut:
    return await svc.update_transaction(transaction_id, payload)


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def patch_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    svc: TransactionsService = Depends(get_transactions_service),
) -> TransactionOut:
    return await svc.update_transaction(transaction_id, payload)


@router.delete("/{transaction_id}", response_model=TransactionOut)
async def delete_transaction(
    transaction_id: str,
    svc: TransactionsService = Depends(get_transactions_service),
) -> TransactionOut:
    return await svc.delete_transaction(transaction_id)


