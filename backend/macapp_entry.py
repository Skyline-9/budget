from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn
from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

# Import your existing FastAPI app:
from app.main import app  # <-- your current app instance

# #region agent log
import json
import time
def log_debug(location, message, data, hypothesis_id):
    log_path = "/Users/Richard.Luo4/Developer/budget/.cursor/debug.log"
    entry = {"timestamp": int(time.time() * 1000), "location": location, "message": message, "data": data, "sessionId": "debug-session", "hypothesisId": hypothesis_id}
    try:
        with open(log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except: pass
# #endregion


def _find_webapp_dist_dir() -> Path | None:
    """
    Resolve the Vite build output (dist) that we bundle into the executable.

    Supports:
      - PyInstaller one-folder mode: webapp_dist next to executable
      - PyInstaller one-file mode: webapp_dist under sys._MEIPASS extraction dir
      - Dev fallback: ../webapp/dist
    """
    # #region agent log
    log_debug("macapp_entry.py:31", "Searching for webapp dist", {"frozen": getattr(sys, "frozen", False), "executable": sys.executable, "meipass": getattr(sys, "_MEIPASS", None)}, "E")
    # #endregion
    
    # Explicit override (useful when running unbundled)
    env = os.environ.get("WEBAPP_DIST")
    if env:
        p = Path(env).expanduser().resolve()
        return p if p.exists() else None

    # PyInstaller
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            p = Path(meipass) / "webapp_dist"
            if p.exists():
                return p

        # one-folder: data sits next to the executable
        p = Path(sys.executable).resolve().parent / "webapp_dist"
        if p.exists():
            return p

    # Dev fallback: repo layout
    p = (Path(__file__).resolve().parent.parent / "webapp" / "dist")
    return p if p.exists() else None


# Readiness endpoint (Swift app polls this)
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

# #region agent log
from fastapi import Request as FastAPIRequest
@app.post("/api/debug-log", include_in_schema=False)
async def debug_log(request: FastAPIRequest):
    body = await request.json()
    import sys
    print(f"[FRONTEND_DEBUG] {json.dumps(body)}", file=sys.stderr, flush=True)
    log_debug("macapp_entry.py:63", "Frontend log received", body, "G,H")
    return {"ok": True}
# #endregion


DIST_DIR = _find_webapp_dist_dir()
INDEX_FILE = (DIST_DIR / "index.html") if DIST_DIR else None

# #region agent log
log_debug("macapp_entry.py:68", "Webapp dist resolution result", {"dist_dir": str(DIST_DIR) if DIST_DIR else None, "index_exists": INDEX_FILE.exists() if INDEX_FILE else False}, "E")
# #endregion

if DIST_DIR and INDEX_FILE and INDEX_FILE.exists():
    # IMPORTANT: mount static LAST so it does not shadow your API routes or /health
    app.mount(
        "/",
        StaticFiles(directory=str(DIST_DIR), html=True),
        name="frontend",
    )

    def _is_spa_navigation(request: Request) -> bool:
        """
        Only rewrite 404s to index.html for real browser navigations.
        """
        if request.method != "GET":
            return False

        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return True

        mode = request.headers.get("sec-fetch-mode", "")
        dest = request.headers.get("sec-fetch-dest", "")
        return mode == "navigate" or dest == "document"

    @app.exception_handler(StarletteHTTPException)
    async def spa_fallback(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404 and INDEX_FILE and INDEX_FILE.exists() and _is_spa_navigation(request):
            return FileResponse(str(INDEX_FILE))
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
else:
    print("WARNING: webapp dist not found; frontend will not be served.", file=sys.stderr)


def main() -> None:
    host = os.environ.get("MAC_APP_HOST", "127.0.0.1")
    port = int(os.environ.get("MAC_APP_PORT", "8123"))
    log_level = os.environ.get("LOG_LEVEL", "info")
    
    # #region agent log
    log_debug("macapp_entry.py:105", "Backend starting", {"host": host, "port": port, "log_level": log_level, "cwd": os.getcwd(), "argv": sys.argv}, "C,E")
    # #endregion

    # Production-ish defaults: no reload, single worker
    try:
        # #region agent log
        log_debug("macapp_entry.py:111", "About to call uvicorn.run", {}, "C")
        # #endregion
        uvicorn.run(app, host=host, port=port, log_level=log_level, reload=False, workers=1)
        # #region agent log
        log_debug("macapp_entry.py:115", "uvicorn.run completed", {}, "C")
        # #endregion
    except Exception as e:
        # #region agent log
        log_debug("macapp_entry.py:119", "Backend startup exception", {"error": str(e), "type": type(e).__name__}, "C,E")
        # #endregion
        raise


if __name__ == "__main__":
    main()
