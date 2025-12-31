from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_import_service
from app.models.schemas import ImportCashewResponse
from app.services.import_service import ImportService

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/cashew", response_model=ImportCashewResponse)
async def import_cashew_csv(
    file: UploadFile = File(...),
    commit: bool = False,
    skipDuplicates: bool = True,  # noqa: N803 - match query param casing used elsewhere (e.g. minAmountCents).
    preserveExtras: bool = False,  # noqa: N803 - same as above.
    svc: ImportService = Depends(get_import_service),
) -> ImportCashewResponse:
    """
    Import a Cashew transactions CSV export into this app's local CSV storage.

    Safe-by-default: `commit=false` performs a dry-run and returns a summary without writing.
    """
    data = await file.read()
    filename = file.filename or "cashew.csv"
    return await svc.import_cashew_csv_bytes(
        data=data,
        filename=filename,
        commit=commit,
        skip_duplicates=skipDuplicates,
        preserve_extras=preserveExtras,
    )


