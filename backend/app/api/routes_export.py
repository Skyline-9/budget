from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import get_export_service
from app.services.export_service import ExportService

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/csv")
async def export_csv_zip(
    svc: ExportService = Depends(get_export_service),
) -> Response:
    return await svc.export_csv_zip()


@router.get("/xlsx")
async def export_xlsx(
    svc: ExportService = Depends(get_export_service),
) -> Response:
    return await svc.export_xlsx()










