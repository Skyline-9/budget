from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from starlette.concurrency import run_in_threadpool

from app.core.config import Settings
from app.core.errors import BadRequestError, ConflictError
from app.models.schemas import (
    DriveFileStatus,
    DriveStatusResponse,
    DriveSyncFileResult,
    DriveSyncResponse,
)
from app.storage.csv_repo import (
    CsvRepo,
    atomic_write_bytes,
    atomic_write_text,
    backup_file,
    md5_file,
    sha256_file,
    utc_now_iso,
)

logger = logging.getLogger("app.drive")

UTC = timezone.utc

APP_FOLDER_NAME = "BudgetingApp"

CANONICAL_FILES = [
    "transactions.csv",
    "categories.csv",
    "budgets.csv",
    "config.json",
]


def _ts_compact() -> str:
    return datetime.now(tz=UTC).strftime("%Y%m%d-%H%M%S")


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json_atomic(path: Path, payload: Any) -> None:
    _ensure_parent(path)
    atomic_write_text(path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _delete_file_quiet(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except Exception:
        pass


def _drive_scopes(mode: str) -> List[str]:
    if mode == "appdata":
        return ["https://www.googleapis.com/auth/drive.appdata"]
    return ["https://www.googleapis.com/auth/drive.file"]


def _drive_spaces(mode: str) -> str:
    return "appDataFolder" if mode == "appdata" else "drive"


def _media_mime(filename: str) -> str:
    if filename.endswith(".json"):
        return "application/json"
    if filename.endswith(".csv"):
        return "text/csv"
    return "application/octet-stream"


@dataclass
class DriveService:
    settings: Settings
    repo: CsvRepo

    async def get_auth_url(self) -> str:
        return await run_in_threadpool(self._get_auth_url_sync)

    def _get_auth_url_sync(self) -> str:
        mode = self._mode()
        secrets_path = self.settings.google_oauth_client_secrets_path
        if not secrets_path:
            raise BadRequestError("GOOGLE_OAUTH_CLIENT_SECRETS_PATH is not configured.")
        if not secrets_path.exists():
            raise BadRequestError(
                "OAuth client secrets file does not exist.",
                details={"path": str(secrets_path)},
            )

        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_secrets_file(
            str(secrets_path),
            scopes=_drive_scopes(mode),
        )
        flow.redirect_uri = self.settings.drive_oauth_redirect_uri

        # Let google-auth generate a strong state; persist it locally for callback verification.
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )

        st = self._load_state()
        st["mode"] = mode
        st["oauth_state"] = state
        st["oauth_created_at"] = utc_now_iso()
        _write_json_atomic(self.settings.drive_state_path, st)

        return auth_url

    async def handle_oauth_callback(self, *, code: str, state: str) -> None:
        await run_in_threadpool(self._handle_oauth_callback_sync, code, state)

    def _handle_oauth_callback_sync(self, code: str, state: str) -> None:
        mode = self._mode()
        secrets_path = self.settings.google_oauth_client_secrets_path
        if not secrets_path or not secrets_path.exists():
            raise BadRequestError("OAuth client secrets file is not configured or missing.")

        st = self._load_state()
        expected_state = st.get("oauth_state")
        if not expected_state or expected_state != state:
            raise ConflictError("Invalid OAuth state. Please retry connecting Google Drive.")

        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_secrets_file(
            str(secrets_path),
            scopes=_drive_scopes(mode),
            state=state,
        )
        flow.redirect_uri = self.settings.drive_oauth_redirect_uri
        flow.fetch_token(code=code)

        creds = flow.credentials
        _ensure_parent(self.settings.token_path)
        atomic_write_text(self.settings.token_path, creds.to_json())

        # Clear oauth state and persist mode.
        st.pop("oauth_state", None)
        st.pop("oauth_created_at", None)
        st["mode"] = mode
        _write_json_atomic(self.settings.drive_state_path, st)

    async def disconnect(self) -> None:
        await run_in_threadpool(self._disconnect_sync)

    def _disconnect_sync(self) -> None:
        _delete_file_quiet(self.settings.token_path)
        _delete_file_quiet(self.settings.drive_state_path)

    async def status(self) -> DriveStatusResponse:
        return await run_in_threadpool(self._status_sync)

    def _status_sync(self) -> DriveStatusResponse:
        st = self._load_state()
        mode = st.get("mode") or self._mode()
        connected = self.settings.token_path.exists()

        files_status: List[DriveFileStatus] = []
        files = st.get("files", {}) if isinstance(st.get("files", {}), dict) else {}
        for filename in CANONICAL_FILES:
            entry = files.get(filename, {}) if isinstance(files.get(filename, {}), dict) else {}
            files_status.append(
                DriveFileStatus(
                    filename=filename,
                    file_id=entry.get("file_id"),
                    drive_md5=entry.get("drive_md5"),
                    drive_modified_time=entry.get("drive_modified_time"),
                    local_sha256=entry.get("local_sha256"),
                )
            )

        return DriveStatusResponse(
            connected=connected,
            mode=mode,
            last_sync_at=st.get("last_sync_at"),
            folder_id=st.get("folder_id"),
            files=files_status,
        )

    async def push(self) -> DriveSyncResponse:
        return await run_in_threadpool(self._push_sync)

    async def pull(self) -> DriveSyncResponse:
        return await run_in_threadpool(self._pull_sync)

    async def smart_sync(self) -> DriveSyncResponse:
        return await run_in_threadpool(self._smart_sync_sync)

    # -----------------------
    # Internal helpers
    # -----------------------

    def _mode(self) -> str:
        m = (self.settings.drive_sync_mode or "folder").lower()
        return "appdata" if m == "appdata" else "folder"

    def _load_state(self) -> Dict[str, Any]:
        st = _read_json(self.settings.drive_state_path, default={})
        if not isinstance(st, dict):
            st = {}
        st.setdefault("schema_version", 1)
        st.setdefault("mode", self._mode())
        st.setdefault("files", {})
        return st

    def _save_state(self, st: Dict[str, Any]) -> None:
        _write_json_atomic(self.settings.drive_state_path, st)

    def _require_connected(self) -> None:
        if not self.settings.token_path.exists():
            raise BadRequestError("Google Drive is not connected.")

    def _get_credentials(self):
        mode = self._mode()
        scopes = _drive_scopes(mode)

        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials

        creds = Credentials.from_authorized_user_file(str(self.settings.token_path), scopes=scopes)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            atomic_write_text(self.settings.token_path, creds.to_json())
        return creds

    def _build_drive(self):
        creds = self._get_credentials()
        from googleapiclient.discovery import build

        return build("drive", "v3", credentials=creds, cache_discovery=False)

    def _ensure_folder_id(self, service, st: Dict[str, Any]) -> Optional[str]:
        mode = self._mode()
        if mode != "folder":
            st.pop("folder_id", None)
            return None

        folder_id = st.get("folder_id")
        if folder_id:
            return folder_id

        # Find or create folder in My Drive.
        q = (
            f"mimeType='application/vnd.google-apps.folder' and name='{APP_FOLDER_NAME}' and trashed=false"
        )
        resp = (
            service.files()
            .list(q=q, spaces="drive", fields="files(id,name)", pageSize=10)
            .execute()
        )
        files = resp.get("files", []) or []
        if files:
            folder_id = files[0]["id"]
        else:
            created = (
                service.files()
                .create(
                    body={"name": APP_FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"},
                    fields="id",
                )
                .execute()
            )
            folder_id = created["id"]

        st["folder_id"] = folder_id
        return folder_id

    def _find_file(self, service, *, mode: str, folder_id: Optional[str], filename: str) -> Optional[Dict[str, Any]]:
        if mode == "folder":
            if not folder_id:
                return None
            q = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
            spaces = "drive"
        else:
            q = f"name='{filename}' and trashed=false"
            spaces = "appDataFolder"

        resp = (
            service.files()
            .list(q=q, spaces=spaces, fields="files(id,name,md5Checksum,modifiedTime)", pageSize=10)
            .execute()
        )
        files = resp.get("files", []) or []
        return files[0] if files else None

    def _get_file_metadata(self, service, file_id: str) -> Optional[Dict[str, Any]]:
        try:
            return (
                service.files()
                .get(fileId=file_id, fields="id,name,md5Checksum,modifiedTime,size")
                .execute()
            )
        except Exception:
            return None

    def _upload_file(
        self,
        service,
        *,
        mode: str,
        folder_id: Optional[str],
        local_path: Path,
        filename: str,
        existing_file_id: Optional[str],
    ) -> Dict[str, Any]:
        from googleapiclient.http import MediaFileUpload

        media = MediaFileUpload(str(local_path), mimetype=_media_mime(filename), resumable=False)
        fields = "id,md5Checksum,modifiedTime"

        if existing_file_id:
            return service.files().update(fileId=existing_file_id, media_body=media, fields=fields).execute()

        body: Dict[str, Any] = {"name": filename}
        if mode == "folder":
            if not folder_id:
                raise BadRequestError("Drive folder_id missing.")
            body["parents"] = [folder_id]
        else:
            body["parents"] = ["appDataFolder"]

        return service.files().create(body=body, media_body=media, fields=fields).execute()

    def _download_file_bytes(self, service, file_id: str) -> bytes:
        from googleapiclient.http import MediaIoBaseDownload

        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return fh.getvalue()

    def _conflict_name(self, filename: str) -> str:
        suffix = Path(filename).suffix
        stem = Path(filename).stem
        return f"{stem}.conflict-{_ts_compact()}{suffix}"

    # -----------------------
    # Push / Pull / Smart sync
    # -----------------------

    def _push_sync(self) -> DriveSyncResponse:
        self._require_connected()
        mode = self._mode()
        service = self._build_drive()

        st = self._load_state()
        st["mode"] = mode
        folder_id = self._ensure_folder_id(service, st)
        files_state: Dict[str, Any] = st.setdefault("files", {})

        results: List[DriveSyncFileResult] = []

        for filename in CANONICAL_FILES:
            local_path = self.settings.data_dir / filename
            if not local_path.exists():
                results.append(
                    DriveSyncFileResult(filename=filename, action="push", status="skipped", message="Missing locally")
                )
                continue

            local_sha = sha256_file(local_path)
            local_md5 = md5_file(local_path)

            entry = files_state.get(filename, {}) if isinstance(files_state.get(filename, {}), dict) else {}
            file_id = entry.get("file_id")
            meta = self._get_file_metadata(service, file_id) if file_id else None
            if not meta:
                found = self._find_file(service, mode=mode, folder_id=folder_id, filename=filename)
                file_id = found.get("id") if found else None

            try:
                uploaded = self._upload_file(
                    service,
                    mode=mode,
                    folder_id=folder_id,
                    local_path=local_path,
                    filename=filename,
                    existing_file_id=file_id,
                )
                file_id = uploaded.get("id")
                files_state[filename] = {
                    "file_id": file_id,
                    "drive_md5": uploaded.get("md5Checksum"),
                    "drive_modified_time": uploaded.get("modifiedTime"),
                    "local_sha256": local_sha,
                    "local_md5": local_md5,
                }
                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="push",
                        status="ok",
                        file_id=file_id,
                        drive_md5=uploaded.get("md5Checksum"),
                        drive_modified_time=uploaded.get("modifiedTime"),
                        local_sha256=local_sha,
                    )
                )
            except Exception as e:
                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="push",
                        status="error",
                        message=str(e),
                    )
                )

        st["last_sync_at"] = utc_now_iso()
        self._save_state(st)
        return DriveSyncResponse(mode=mode, results=results, last_sync_at=st.get("last_sync_at"))

    def _pull_sync(self) -> DriveSyncResponse:
        self._require_connected()
        mode = self._mode()
        service = self._build_drive()

        st = self._load_state()
        st["mode"] = mode
        folder_id = self._ensure_folder_id(service, st)
        files_state: Dict[str, Any] = st.setdefault("files", {})

        results: List[DriveSyncFileResult] = []

        for filename in CANONICAL_FILES:
            entry = files_state.get(filename, {}) if isinstance(files_state.get(filename, {}), dict) else {}
            file_id = entry.get("file_id")
            meta = self._get_file_metadata(service, file_id) if file_id else None
            if not meta:
                found = self._find_file(service, mode=mode, folder_id=folder_id, filename=filename)
                meta = found
                file_id = found.get("id") if found else None

            if not file_id or not meta:
                results.append(
                    DriveSyncFileResult(filename=filename, action="pull", status="skipped", message="Not found on Drive")
                )
                continue

            try:
                content = self._download_file_bytes(service, file_id)
                local_path = self.settings.data_dir / filename
                backup_file(local_path, self.repo.backups_dir)
                atomic_write_bytes(local_path, content)

                local_sha = sha256_file(local_path)
                local_md5 = md5_file(local_path)

                files_state[filename] = {
                    "file_id": file_id,
                    "drive_md5": meta.get("md5Checksum"),
                    "drive_modified_time": meta.get("modifiedTime"),
                    "local_sha256": local_sha,
                    "local_md5": local_md5,
                }

                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="pull",
                        status="ok",
                        file_id=file_id,
                        drive_md5=meta.get("md5Checksum"),
                        drive_modified_time=meta.get("modifiedTime"),
                        local_sha256=local_sha,
                    )
                )
            except Exception as e:
                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="pull",
                        status="error",
                        message=str(e),
                        file_id=file_id,
                    )
                )

        st["last_sync_at"] = utc_now_iso()
        self._save_state(st)
        return DriveSyncResponse(mode=mode, results=results, last_sync_at=st.get("last_sync_at"))

    def _smart_sync_sync(self) -> DriveSyncResponse:
        self._require_connected()
        mode = self._mode()
        service = self._build_drive()

        st = self._load_state()
        st["mode"] = mode
        folder_id = self._ensure_folder_id(service, st)
        files_state: Dict[str, Any] = st.setdefault("files", {})

        results: List[DriveSyncFileResult] = []

        for filename in CANONICAL_FILES:
            local_path = self.settings.data_dir / filename
            local_exists = local_path.exists()
            local_sha = sha256_file(local_path) if local_exists else None
            local_md5 = md5_file(local_path) if local_exists else None

            prev = files_state.get(filename, {}) if isinstance(files_state.get(filename, {}), dict) else {}
            prev_sha = prev.get("local_sha256")
            prev_drive_md5 = prev.get("drive_md5")
            prev_drive_mtime = prev.get("drive_modified_time")
            prev_file_id = prev.get("file_id")

            meta = self._get_file_metadata(service, prev_file_id) if prev_file_id else None
            if not meta:
                found = self._find_file(service, mode=mode, folder_id=folder_id, filename=filename)
                meta = found

            drive_exists = bool(meta and meta.get("id"))
            drive_file_id = meta.get("id") if meta else None
            drive_md5 = meta.get("md5Checksum") if meta else None
            drive_mtime = meta.get("modifiedTime") if meta else None

            # First sync state unknown -> treat carefully.
            has_prev_state = bool(prev.get("file_id") or prev_sha or prev_drive_md5 or prev_drive_mtime)

            if not drive_exists and local_exists:
                # Drive missing -> push create
                try:
                    uploaded = self._upload_file(
                        service,
                        mode=mode,
                        folder_id=folder_id,
                        local_path=local_path,
                        filename=filename,
                        existing_file_id=None,
                    )
                    files_state[filename] = {
                        "file_id": uploaded.get("id"),
                        "drive_md5": uploaded.get("md5Checksum"),
                        "drive_modified_time": uploaded.get("modifiedTime"),
                        "local_sha256": local_sha,
                        "local_md5": local_md5,
                    }
                    results.append(
                        DriveSyncFileResult(
                            filename=filename,
                            action="push",
                            status="ok",
                            file_id=uploaded.get("id"),
                            drive_md5=uploaded.get("md5Checksum"),
                            drive_modified_time=uploaded.get("modifiedTime"),
                            local_sha256=local_sha,
                        )
                    )
                except Exception as e:
                    results.append(
                        DriveSyncFileResult(filename=filename, action="push", status="error", message=str(e))
                    )
                continue

            if drive_exists and not local_exists:
                # Local missing -> pull
                try:
                    content = self._download_file_bytes(service, drive_file_id)
                    backup_file(local_path, self.repo.backups_dir)
                    atomic_write_bytes(local_path, content)
                    local_sha2 = sha256_file(local_path)
                    local_md52 = md5_file(local_path)
                    files_state[filename] = {
                        "file_id": drive_file_id,
                        "drive_md5": drive_md5,
                        "drive_modified_time": drive_mtime,
                        "local_sha256": local_sha2,
                        "local_md5": local_md52,
                    }
                    results.append(
                        DriveSyncFileResult(
                            filename=filename,
                            action="pull",
                            status="ok",
                            file_id=drive_file_id,
                            drive_md5=drive_md5,
                            drive_modified_time=drive_mtime,
                            local_sha256=local_sha2,
                        )
                    )
                except Exception as e:
                    results.append(
                        DriveSyncFileResult(
                            filename=filename, action="pull", status="error", message=str(e), file_id=drive_file_id
                        )
                    )
                continue

            if not drive_exists and not local_exists:
                results.append(
                    DriveSyncFileResult(filename=filename, action="sync", status="skipped", message="Missing on both")
                )
                continue

            # Both exist at this point
            same_content = bool(local_md5 and drive_md5 and local_md5 == drive_md5)

            if not has_prev_state:
                if same_content:
                    # First time: content identical; just record state.
                    files_state[filename] = {
                        "file_id": drive_file_id,
                        "drive_md5": drive_md5,
                        "drive_modified_time": drive_mtime,
                        "local_sha256": local_sha,
                        "local_md5": local_md5,
                    }
                    results.append(DriveSyncFileResult(filename=filename, action="sync", status="skipped"))
                    continue
                # First time and content differs: treat as conflict (never overwrite silently).
                local_changed = True
                drive_changed = True
            else:
                local_changed = (prev_sha is not None) and (local_sha != prev_sha)
                drive_changed = False
                if prev_drive_md5 and drive_md5 and drive_md5 != prev_drive_md5:
                    drive_changed = True
                elif prev_drive_mtime and drive_mtime and drive_mtime != prev_drive_mtime:
                    drive_changed = True

            if not local_changed and not drive_changed:
                results.append(DriveSyncFileResult(filename=filename, action="sync", status="skipped"))
                continue

            if local_changed and not drive_changed:
                # push update
                try:
                    uploaded = self._upload_file(
                        service,
                        mode=mode,
                        folder_id=folder_id,
                        local_path=local_path,
                        filename=filename,
                        existing_file_id=drive_file_id,
                    )
                    files_state[filename] = {
                        "file_id": uploaded.get("id"),
                        "drive_md5": uploaded.get("md5Checksum"),
                        "drive_modified_time": uploaded.get("modifiedTime"),
                        "local_sha256": local_sha,
                        "local_md5": local_md5,
                    }
                    results.append(
                        DriveSyncFileResult(
                            filename=filename,
                            action="push",
                            status="ok",
                            file_id=uploaded.get("id"),
                            drive_md5=uploaded.get("md5Checksum"),
                            drive_modified_time=uploaded.get("modifiedTime"),
                            local_sha256=local_sha,
                        )
                    )
                except Exception as e:
                    results.append(
                        DriveSyncFileResult(filename=filename, action="push", status="error", message=str(e))
                    )
                continue

            if drive_changed and not local_changed:
                # pull update
                try:
                    content = self._download_file_bytes(service, drive_file_id)
                    backup_file(local_path, self.repo.backups_dir)
                    atomic_write_bytes(local_path, content)
                    local_sha2 = sha256_file(local_path)
                    local_md52 = md5_file(local_path)
                    files_state[filename] = {
                        "file_id": drive_file_id,
                        "drive_md5": drive_md5,
                        "drive_modified_time": drive_mtime,
                        "local_sha256": local_sha2,
                        "local_md5": local_md52,
                    }
                    results.append(
                        DriveSyncFileResult(
                            filename=filename,
                            action="pull",
                            status="ok",
                            file_id=drive_file_id,
                            drive_md5=drive_md5,
                            drive_modified_time=drive_mtime,
                            local_sha256=local_sha2,
                        )
                    )
                except Exception as e:
                    results.append(
                        DriveSyncFileResult(
                            filename=filename, action="pull", status="error", message=str(e), file_id=drive_file_id
                        )
                    )
                continue

            # Both changed (or initial unknown with differences) -> conflict resolution
            if same_content:
                files_state[filename] = {
                    "file_id": drive_file_id,
                    "drive_md5": drive_md5,
                    "drive_modified_time": drive_mtime,
                    "local_sha256": local_sha,
                    "local_md5": local_md5,
                }
                results.append(DriveSyncFileResult(filename=filename, action="sync", status="skipped"))
                continue

            conflict_local_name = self._conflict_name(filename)
            conflict_local_path = self.settings.data_dir / conflict_local_name

            try:
                # 1) Download Drive version to conflict copy locally
                content = self._download_file_bytes(service, drive_file_id)
                atomic_write_bytes(conflict_local_path, content)

                # 2) Upload conflict copy to Drive (as separate file)
                conflict_uploaded = self._upload_file(
                    service,
                    mode=mode,
                    folder_id=folder_id,
                    local_path=conflict_local_path,
                    filename=conflict_local_name,
                    existing_file_id=None,
                )

                # 3) Keep local as canonical and overwrite Drive canonical with local
                uploaded = self._upload_file(
                    service,
                    mode=mode,
                    folder_id=folder_id,
                    local_path=local_path,
                    filename=filename,
                    existing_file_id=drive_file_id,
                )

                files_state[filename] = {
                    "file_id": uploaded.get("id"),
                    "drive_md5": uploaded.get("md5Checksum"),
                    "drive_modified_time": uploaded.get("modifiedTime"),
                    "local_sha256": local_sha,
                    "local_md5": local_md5,
                }

                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="conflict",
                        status="conflict",
                        message="Both local and Drive changed; saved conflict copy locally and on Drive.",
                        file_id=uploaded.get("id"),
                        drive_md5=uploaded.get("md5Checksum"),
                        drive_modified_time=uploaded.get("modifiedTime"),
                        local_sha256=local_sha,
                        conflict_local_copy=conflict_local_name,
                        conflict_drive_file_id=conflict_uploaded.get("id"),
                    )
                )
            except Exception as e:
                results.append(
                    DriveSyncFileResult(
                        filename=filename,
                        action="conflict",
                        status="error",
                        message=str(e),
                        details={"conflict_local_copy": conflict_local_name},
                    )
                )

        st["last_sync_at"] = utc_now_iso()
        self._save_state(st)
        return DriveSyncResponse(mode=mode, results=results, last_sync_at=st.get("last_sync_at"))


