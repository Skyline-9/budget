from __future__ import annotations

from fastapi import Request

from app.core.config import Settings
from app.services.budgets_service import BudgetsService
from app.services.categories_service import CategoriesService
from app.services.dashboard_service import DashboardService
from app.services.drive_service import DriveService
from app.services.export_service import ExportService
from app.services.import_service import ImportService
from app.services.transactions_service import TransactionsService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_transactions_service(request: Request) -> TransactionsService:
    return request.app.state.transactions_service


def get_categories_service(request: Request) -> CategoriesService:
    return request.app.state.categories_service


def get_budgets_service(request: Request) -> BudgetsService:
    return request.app.state.budgets_service


def get_dashboard_service(request: Request) -> DashboardService:
    return request.app.state.dashboard_service


def get_export_service(request: Request) -> ExportService:
    return request.app.state.export_service


def get_drive_service(request: Request) -> DriveService:
    return request.app.state.drive_service


def get_import_service(request: Request) -> ImportService:
    return request.app.state.import_service







