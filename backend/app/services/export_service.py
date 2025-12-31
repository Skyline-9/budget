from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.storage.csv_repo import CsvRepo

UTC = timezone.utc


def _ts() -> str:
    return datetime.now(tz=UTC).strftime("%Y%m%d-%H%M%S")


@dataclass
class ExportService:
    repo: CsvRepo

    async def export_csv_zip(self) -> Response:
        return await run_in_threadpool(self._export_csv_zip_sync)

    def _export_csv_zip_sync(self) -> Response:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
            for path in [self.repo.transactions_path, self.repo.categories_path, self.repo.budgets_path]:
                if path.exists():
                    z.write(path, arcname=path.name)

        data = buf.getvalue()
        filename = f"budget-export-{_ts()}.zip"
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    async def export_xlsx(self) -> Response:
        return await run_in_threadpool(self._export_xlsx_sync)

    def _export_xlsx_sync(self) -> Response:
        out = io.BytesIO()

        tx = pd.read_csv(self.repo.transactions_path, dtype=str, keep_default_na=False)
        cats = pd.read_csv(self.repo.categories_path, dtype=str, keep_default_na=False)
        budgets = pd.read_csv(self.repo.budgets_path, dtype=str, keep_default_na=False)

        with pd.ExcelWriter(out, engine="openpyxl") as writer:
            tx.to_excel(writer, sheet_name="Transactions", index=False)
            cats.to_excel(writer, sheet_name="Categories", index=False)
            budgets.to_excel(writer, sheet_name="Budgets", index=False)

        filename = f"budget-export-{_ts()}.xlsx"
        return Response(
            content=out.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )










