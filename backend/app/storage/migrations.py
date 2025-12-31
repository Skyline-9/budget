from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from app.storage.csv_repo import CsvRepo, utc_now_iso

SCHEMA_VERSION = 1


TRANSACTIONS_COLUMNS: List[str] = [
    "id",
    "date",
    "amount_cents",
    "category_id",
    "merchant",
    "notes",
    "created_at",
    "updated_at",
    "deleted",
]
TRANSACTIONS_DEFAULTS: Dict[str, Any] = {
    "id": "",
    "date": "",
    "amount_cents": "0",
    "category_id": "",
    "merchant": "",
    "notes": "",
    "created_at": utc_now_iso(),
    "updated_at": utc_now_iso(),
    "deleted": "false",
}

CATEGORIES_COLUMNS: List[str] = [
    "id",
    "name",
    "kind",
    "parent_id",
    "active",
    "created_at",
    "updated_at",
]
CATEGORIES_DEFAULTS: Dict[str, Any] = {
    "id": "",
    "name": "",
    "kind": "expense",
    "parent_id": "",
    "active": "true",
    "created_at": utc_now_iso(),
    "updated_at": utc_now_iso(),
}

BUDGETS_COLUMNS: List[str] = ["month", "category_id", "budget_cents"]
BUDGETS_DEFAULTS: Dict[str, Any] = {
    "month": "",
    "category_id": "",
    "budget_cents": "0",
}


def _read_csv_header(path: Path) -> Optional[List[str]]:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8", newline="") as f:
        first = f.readline()
    if not first:
        return []
    return next(csv.reader([first.strip()]), [])


def _needs_columns(existing: Optional[List[str]], required: List[str]) -> bool:
    if existing is None:
        return True
    existing_set = set(existing)
    return any(col not in existing_set for col in required)


@dataclass(frozen=True)
class MigrationResult:
    schema_version: int
    migrated_files: List[str]


def migrate_data_dir(data_dir: Path) -> MigrationResult:
    """
    Ensure `data_dir` has required files, config, and minimal schema migrations.

    Important: this function avoids rewriting files unless a migration is needed,
    to prevent backup churn on every startup.
    """

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "backups").mkdir(parents=True, exist_ok=True)
    (data_dir / ".secrets").mkdir(parents=True, exist_ok=True)

    repo = CsvRepo(data_dir=data_dir, backups_dir=data_dir / "backups")

    migrated: List[str] = []

    # config.json
    config_path = repo.config_path
    config: Dict[str, Any] = repo.read_json(config_path, default={})
    if config.get("schema_version") != SCHEMA_VERSION:
        config.setdefault("created_at", utc_now_iso())
        config["schema_version"] = SCHEMA_VERSION
        config["updated_at"] = utc_now_iso()
        repo.write_json(config_path, config)
        migrated.append(config_path.name)

    # CSV files (create or add missing columns)
    for path, cols, defaults in [
        (repo.transactions_path, TRANSACTIONS_COLUMNS, TRANSACTIONS_DEFAULTS),
        (repo.categories_path, CATEGORIES_COLUMNS, CATEGORIES_DEFAULTS),
        (repo.budgets_path, BUDGETS_COLUMNS, BUDGETS_DEFAULTS),
    ]:
        existing_header = _read_csv_header(path)
        if not _needs_columns(existing_header, cols):
            continue

        if path.exists():
            df = pd.read_csv(path, dtype=str, keep_default_na=False)
        else:
            df = pd.DataFrame(columns=cols)

        repo.write_csv(path, df, columns=cols, defaults=defaults)
        migrated.append(path.name)

    return MigrationResult(schema_version=SCHEMA_VERSION, migrated_files=migrated)










