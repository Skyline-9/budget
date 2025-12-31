from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import pandas as pd

UTC = timezone.utc


def utc_now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def md5_file(path: Path) -> str:
    h = hashlib.md5()  # noqa: S324 - md5 is for Drive checksum parity, not security.
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _timestamp_compact() -> str:
    return datetime.now(tz=UTC).strftime("%Y%m%d-%H%M%S")


def backup_file(src: Path, backups_dir: Path) -> Optional[Path]:
    if not src.exists():
        return None
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = _timestamp_compact()
    backup_name = f"{src.stem}.{ts}{src.suffix}"
    dst = backups_dir / backup_name
    shutil.copy2(src, dst)
    return dst


def atomic_write_bytes(target_path: Path, data: bytes) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path_str = tempfile.mkstemp(
        prefix=f".{target_path.name}.tmp-",
        dir=str(target_path.parent),
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, target_path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass


def atomic_write_text(target_path: Path, text: str) -> None:
    atomic_write_bytes(target_path, text.encode("utf-8"))


def _ensure_columns(df: pd.DataFrame, columns: Iterable[str], defaults: Dict[str, Any]) -> pd.DataFrame:
    cols = list(columns)
    for c in cols:
        if c not in df.columns:
            df[c] = defaults.get(c, "")
    # Preserve extra columns, but keep our canonical ordering first.
    ordered = cols + [c for c in df.columns if c not in cols]
    return df[ordered]


@dataclass
class CsvRepo:
    data_dir: Path
    backups_dir: Path

    def __post_init__(self) -> None:
        self._lock = threading.RLock()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)

    @property
    def transactions_path(self) -> Path:
        return self.data_dir / "transactions.csv"

    @property
    def categories_path(self) -> Path:
        return self.data_dir / "categories.csv"

    @property
    def budgets_path(self) -> Path:
        return self.data_dir / "budgets.csv"

    @property
    def config_path(self) -> Path:
        return self.data_dir / "config.json"

    def read_json(self, path: Path, default: Any) -> Any:
        with self._lock:
            if not path.exists():
                return default
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

    def write_json(self, path: Path, payload: Any) -> None:
        with self._lock:
            backup_file(path, self.backups_dir)
            atomic_write_text(path, json.dumps(payload, indent=2, sort_keys=True) + "\n")

    def read_csv(self, path: Path, *, columns: list[str], defaults: dict[str, Any]) -> pd.DataFrame:
        with self._lock:
            if not path.exists():
                # Create empty file with header.
                empty = pd.DataFrame(columns=columns)
                atomic_write_text(path, empty.to_csv(index=False))
                return empty

            df = pd.read_csv(path, dtype=str, keep_default_na=False)
            df = _ensure_columns(df, columns, defaults)
            return df

    def write_csv(self, path: Path, df: pd.DataFrame, *, columns: list[str], defaults: dict[str, Any]) -> None:
        with self._lock:
            df2 = _ensure_columns(df.copy(), columns, defaults)
            backup_file(path, self.backups_dir)
            atomic_write_text(path, df2.to_csv(index=False))










