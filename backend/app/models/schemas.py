from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]

class OkResponse(BaseModel):
    ok: Literal[True] = True


# ---------------------------
# Categories
# ---------------------------

CategoryKind = Literal["expense", "income"]


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: CategoryKind
    parent_id: Optional[str] = None
    active: bool = True


class CategoryCreate(CategoryBase):
    id: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    kind: Optional[CategoryKind] = None
    parent_id: Optional[str] = None
    active: Optional[bool] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: datetime
    updated_at: datetime


# ---------------------------
# Transactions
# ---------------------------


class TransactionBase(BaseModel):
    date: date
    amount_cents: int
    category_id: str
    merchant: Optional[str] = None
    notes: Optional[str] = None


class TransactionCreate(TransactionBase):
    id: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    amount_cents: Optional[int] = None
    category_id: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None


class TransactionOut(TransactionBase):
    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: datetime
    updated_at: datetime
    deleted: bool


class TransactionListResponse(BaseModel):
    items: List[TransactionOut]
    total: int
    limit: int
    offset: int


# ---------------------------
# Budgets (scaffold)
# ---------------------------


class BudgetOut(BaseModel):
    month: str  # YYYY-MM
    category_id: str
    budget_cents: int


class BudgetUpsert(BaseModel):
    month: str  # YYYY-MM
    budget_cents: int


# ---------------------------
# Dashboard
# ---------------------------


class DashboardSummaryResponse(BaseModel):
    income_cents: int
    expense_cents: int
    net_cents: int
    savings_rate: Optional[float] = None  # 0..1


class DashboardTrendPoint(BaseModel):
    period: str  # YYYY-MM (interval=month) or YYYY-MM-DD (interval=day)
    income_cents: int
    expense_cents: int
    net_cents: int


class DashboardTrendResponse(BaseModel):
    interval: Literal["month", "day"]
    points: List[DashboardTrendPoint]


class DashboardByCategoryItem(BaseModel):
    category_id: str
    category_name: str
    total_cents: int


class DashboardByCategoryResponse(BaseModel):
    kind: CategoryKind
    items: List[DashboardByCategoryItem]


class DashboardCategoryTrendSeries(BaseModel):
    category_id: str
    category_name: str
    total_cents: int
    values_cents: List[int]


class DashboardCategoryTrendResponse(BaseModel):
    # Currently only "month" is supported (matches the UI request: scroll through months).
    interval: Literal["month"]
    kind: CategoryKind
    periods: List[str]  # YYYY-MM
    series: List[DashboardCategoryTrendSeries]


# ---------------------------
# Drive sync
# ---------------------------


class DriveAuthUrlResponse(BaseModel):
    url: str


class DriveFileStatus(BaseModel):
    filename: str
    file_id: Optional[str] = None
    drive_md5: Optional[str] = None
    drive_modified_time: Optional[str] = None
    local_sha256: Optional[str] = None


class DriveStatusResponse(BaseModel):
    connected: bool
    mode: str
    last_sync_at: Optional[str] = None
    folder_id: Optional[str] = None
    files: List[DriveFileStatus] = Field(default_factory=list)


class DriveSyncFileResult(BaseModel):
    filename: str
    action: str
    status: Literal["ok", "skipped", "conflict", "error"]
    message: Optional[str] = None
    file_id: Optional[str] = None
    drive_md5: Optional[str] = None
    drive_modified_time: Optional[str] = None
    local_sha256: Optional[str] = None
    conflict_local_copy: Optional[str] = None
    conflict_drive_file_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class DriveSyncResponse(BaseModel):
    mode: str
    results: List[DriveSyncFileResult]
    last_sync_at: Optional[str] = None


# ---------------------------
# Import
# ---------------------------


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportCashewResponse(BaseModel):
    ok: Literal[True] = True
    filename: str
    commit: bool
    skip_duplicates: bool
    preserve_extras: bool

    total_rows: int
    parsed_rows: int
    invalid_rows: int

    categories_created: int
    transactions_created: int
    transactions_skipped: int

    column_mapping: Dict[str, str] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    errors: List[ImportRowError] = Field(default_factory=list)
