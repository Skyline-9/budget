from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core.errors import ConflictError


@dataclass
class SingleInstanceLock:
    """
    Cross-process lock using an on-disk lock file.

    This is used to ensure only ONE backend instance is running as the writer
    against the CSV data directory.
    """

    lock_path: Path
    _fh: Optional[object] = None

    def acquire(self) -> None:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        fh = open(self.lock_path, "a+", encoding="utf-8")
        try:
            self._lock_file(fh)
        except Exception:
            try:
                fh.close()
            except Exception:
                pass
            raise
        self._fh = fh

    def release(self) -> None:
        if not self._fh:
            return
        try:
            self._unlock_file(self._fh)
        finally:
            try:
                self._fh.close()
            finally:
                self._fh = None

    def acquire_or_raise(self) -> None:
        try:
            self.acquire()
        except ConflictError:
            raise
        except Exception as e:
            raise ConflictError(
                "Another server instance is already running (could not acquire data/.lock).",
                details={"lock_path": str(self.lock_path), "error": str(e)},
            ) from e

    @staticmethod
    def _lock_file(fh: object) -> None:
        """
        Lock implementation for macOS/Linux + Windows.
        """

        if os.name == "nt":
            import msvcrt  # type: ignore

            # Lock 1 byte at start of file.
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            return

        import fcntl  # type: ignore

        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def _unlock_file(fh: object) -> None:
        if os.name == "nt":
            import msvcrt  # type: ignore

            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            return

        import fcntl  # type: ignore

        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


