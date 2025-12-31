from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

from app.api.deps import get_drive_service, get_settings
from app.models.schemas import DriveAuthUrlResponse, DriveStatusResponse, DriveSyncResponse
from app.services.drive_service import DriveService

router = APIRouter(prefix="/api/drive", tags=["drive"])


@router.get("/auth/url", response_model=DriveAuthUrlResponse)
async def drive_auth_url(
    svc: DriveService = Depends(get_drive_service),
) -> DriveAuthUrlResponse:
    url = await svc.get_auth_url()
    return DriveAuthUrlResponse(url=url)


@router.get("/auth/callback")
async def drive_auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    svc: DriveService = Depends(get_drive_service),
    settings=Depends(get_settings),
) -> RedirectResponse:
    await svc.handle_oauth_callback(code=code, state=state)
    return RedirectResponse(url=f"{settings.frontend_url}/settings?drive=connected", status_code=302)


@router.post("/disconnect")
async def drive_disconnect(
    svc: DriveService = Depends(get_drive_service),
) -> dict:
    await svc.disconnect()
    return {"status": "ok"}


@router.get("/status", response_model=DriveStatusResponse)
async def drive_status(
    svc: DriveService = Depends(get_drive_service),
) -> DriveStatusResponse:
    return await svc.status()


@router.post("/sync/push", response_model=DriveSyncResponse)
async def drive_sync_push(
    svc: DriveService = Depends(get_drive_service),
) -> DriveSyncResponse:
    return await svc.push()


@router.post("/sync/pull", response_model=DriveSyncResponse)
async def drive_sync_pull(
    svc: DriveService = Depends(get_drive_service),
) -> DriveSyncResponse:
    return await svc.pull()


@router.post("/sync", response_model=DriveSyncResponse)
async def drive_sync_smart(
    svc: DriveService = Depends(get_drive_service),
) -> DriveSyncResponse:
    return await svc.smart_sync()










