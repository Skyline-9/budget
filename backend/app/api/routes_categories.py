from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_categories_service
from app.models.schemas import CategoryCreate, CategoryOut, CategoryUpdate, OkResponse
from app.services.categories_service import CategoriesService

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    svc: CategoriesService = Depends(get_categories_service),
) -> list[CategoryOut]:
    return await svc.list_categories()


@router.post("", response_model=CategoryOut)
async def create_category(
    payload: CategoryCreate,
    svc: CategoriesService = Depends(get_categories_service),
) -> CategoryOut:
    return await svc.create_category(payload)


@router.put("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    svc: CategoriesService = Depends(get_categories_service),
) -> CategoryOut:
    return await svc.update_category(category_id, payload)


@router.patch("/{category_id}", response_model=CategoryOut)
async def patch_category(
    category_id: str,
    payload: CategoryUpdate,
    svc: CategoriesService = Depends(get_categories_service),
) -> CategoryOut:
    return await svc.update_category(category_id, payload)


@router.delete("/{category_id}", response_model=OkResponse)
async def delete_category(
    category_id: str,
    reassign_to: str = Query(..., alias="reassignTo"),
    svc: CategoriesService = Depends(get_categories_service),
) -> OkResponse:
    await svc.delete_category(category_id, reassign_to_category_id=reassign_to)
    return OkResponse()


