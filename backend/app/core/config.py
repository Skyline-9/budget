from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv


def _split_csv_env(value: str | None) -> List[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


class Settings:
    """
    Lightweight settings loader (dotenv + env vars).

    Keep this intentionally simple (no pydantic-settings dependency).
    """

    def __init__(self) -> None:
        load_dotenv()

        self.backend_dir: Path = Path(__file__).resolve().parents[2]
        self.repo_root: Path = self.backend_dir.parent

        # macOS app wrapper launches the backend with MAC_APP_HOST/MAC_APP_PORT.
        # Fall back to those so generated callback URLs (e.g. Google OAuth) match the actual running port.
        self.host: str = os.getenv("HOST", os.getenv("MAC_APP_HOST", "127.0.0.1"))
        self.port: int = int(os.getenv("PORT", os.getenv("MAC_APP_PORT", "8123")))
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

        default_data_dir = self.backend_dir / "data"
        self.data_dir: Path = (
            Path(os.getenv("DATA_DIR", str(default_data_dir))).expanduser().resolve()
        )

        # CORS
        self.cors_origins: List[str] = _split_csv_env(os.getenv("CORS_ORIGINS")) or [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]

        # Static SPA serving (optional)
        self.frontend_dist_path: Optional[Path] = self._resolve_frontend_dist_path()

        # Google Drive sync
        self.drive_sync_mode: str = os.getenv("DRIVE_SYNC_MODE", "folder").lower()
        self.google_oauth_client_secrets_path: Optional[Path] = self._resolve_optional_path(
            os.getenv("GOOGLE_OAUTH_CLIENT_SECRETS_PATH")
        )

        self.token_path: Path = self._resolve_path_default(
            os.getenv("TOKEN_PATH"),
            self.data_dir / ".secrets" / "google_token.json",
        )
        self.drive_state_path: Path = self._resolve_path_default(
            os.getenv("DRIVE_STATE_PATH"),
            self.data_dir / ".secrets" / "drive_state.json",
        )

        self.frontend_url: str = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")

        # OAuth callback URL (must match your OAuth client config)
        self.drive_oauth_redirect_uri: str = os.getenv(
            "DRIVE_OAUTH_REDIRECT_URI",
            f"http://{self.host}:{self.port}/api/drive/auth/callback",
        )

    def _resolve_path_default(self, raw: str | None, default: Path) -> Path:
        if raw and raw.strip():
            return Path(raw).expanduser().resolve()
        return default.expanduser().resolve()

    def _resolve_optional_path(self, raw: str | None) -> Optional[Path]:
        if not raw or not raw.strip():
            return None
        return Path(raw).expanduser().resolve()

    def _resolve_frontend_dist_path(self) -> Optional[Path]:
        raw = os.getenv("FRONTEND_DIST_PATH")
        if raw and raw.strip():
            p = Path(raw).expanduser().resolve()
            return p if p.exists() else None

        # Auto-detect common monorepo layouts.
        candidates = [
            self.repo_root / "webapp" / "dist",
            self.repo_root / "frontend" / "dist",
        ]
        for p in candidates:
            if p.exists():
                return p.resolve()
        return None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()










