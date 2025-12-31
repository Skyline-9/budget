from __future__ import annotations

import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """
    Configure clean, readable logging.

    Uvicorn also configures logging; this sets sane defaults for the app logger.
    """

    root = logging.getLogger()
    if root.handlers:
        # Avoid duplicate handlers if uvicorn already configured logging.
        root.setLevel(level)
        return

    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )

    # Quiet down noisy libraries a bit.
    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)










