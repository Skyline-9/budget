from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from app.api.routes_categories import router as categories_router
from app.api.routes_budgets import router as budgets_router
from app.api.routes_dashboard import router as dashboard_router
from app.api.routes_drive_sync import router as drive_router
from app.api.routes_export import router as export_router
from app.api.routes_import import router as import_router
from app.api.routes_transactions import router as transactions_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.models.schemas import HealthResponse
from app.services.budgets_service import BudgetsService
from app.services.categories_service import CategoriesService
from app.services.dashboard_service import DashboardService
from app.services.drive_service import DriveService
from app.services.export_service import ExportService
from app.services.import_service import ImportService
from app.services.transactions_service import TransactionsService
from app.storage.csv_repo import CsvRepo
from app.storage.file_lock import SingleInstanceLock
from app.storage.migrations import migrate_data_dir

logger = logging.getLogger("app")


class SPAStaticFiles(StaticFiles):
    """
    Serve an SPA build output (Vite/React) with history routing support.

    - Normal static assets are served normally.
    - Unknown paths fall back to `index.html`.
    - API routes remain handled by FastAPI routes (mount added after routers).
    """

    async def get_response(self, path: str, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            return await super().get_response("index.html", scope)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    lock = SingleInstanceLock(settings.data_dir / ".lock")
    lock.acquire_or_raise()

    mig = migrate_data_dir(settings.data_dir)
    if mig.migrated_files:
        logger.info("Data migrations applied: %s", ", ".join(mig.migrated_files))

    repo = CsvRepo(data_dir=settings.data_dir, backups_dir=settings.data_dir / "backups")

    # Attach shared singletons.
    app.state.settings = settings
    app.state.repo = repo
    app.state.lock = lock

    app.state.categories_service = CategoriesService(repo=repo)
    app.state.budgets_service = BudgetsService(repo=repo)
    app.state.transactions_service = TransactionsService(repo=repo, categories_service=app.state.categories_service)
    app.state.dashboard_service = DashboardService(repo=repo, categories_service=app.state.categories_service)
    app.state.export_service = ExportService(repo=repo)
    app.state.drive_service = DriveService(settings=settings, repo=repo)
    app.state.import_service = ImportService(repo=repo)

    try:
        yield
    finally:
        lock.release()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="Budget Backend", version="0.1.0", lifespan=lifespan)
    register_exception_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    # API routes
    app.include_router(transactions_router)
    app.include_router(categories_router)
    app.include_router(budgets_router)
    app.include_router(dashboard_router)
    app.include_router(export_router)
    app.include_router(drive_router)
    app.include_router(import_router)

    # Optional static frontend (mounted last so API routes take precedence)
    dist: Optional[Path] = settings.frontend_dist_path
    if dist and (dist / "index.html").exists():
        app.mount("/", SPAStaticFiles(directory=str(dist), html=True), name="spa")
        logger.info("Serving SPA static files from %s", dist)
    else:
        logger.info("SPA dist not found; running API-only mode.")

    return app


app = create_app()


if __name__ == "__main__":
    s = get_settings()
    uvicorn.run("app.main:app", host=s.host, port=s.port, reload=False)


