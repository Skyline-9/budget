from __future__ import annotations

import io
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from starlette.concurrency import run_in_threadpool

from app.core.errors import BadRequestError
from app.models.schemas import ImportCashewResponse, ImportRowError
from app.storage.csv_repo import CsvRepo, utc_now_iso
from app.storage.migrations import CATEGORIES_COLUMNS, CATEGORIES_DEFAULTS, TRANSACTIONS_COLUMNS, TRANSACTIONS_DEFAULTS


@dataclass
class ImportService:
    """Import helpers."""

    repo: CsvRepo

    async def import_cashew_csv_bytes(
        self,
        *,
        data: bytes,
        filename: str,
        commit: bool,
        skip_duplicates: bool,
        preserve_extras: bool,
    ) -> ImportCashewResponse:
        return await run_in_threadpool(
            self._import_cashew_csv_bytes_sync,
            data,
            filename,
            commit,
            skip_duplicates,
            preserve_extras,
        )

    def _import_cashew_csv_bytes_sync(  # noqa: C901 - complexity is OK for an importer.
        self,
        data: bytes,
        filename: str,
        commit: bool,
        skip_duplicates: bool,
        preserve_extras: bool,
    ) -> ImportCashewResponse:
        if not data:
            raise BadRequestError("Empty upload.")

        df_raw = self._read_csv_bytes(data)
        if df_raw.empty:
            return ImportCashewResponse(
                filename=filename,
                commit=commit,
                skip_duplicates=skip_duplicates,
                preserve_extras=preserve_extras,
                total_rows=0,
                parsed_rows=0,
                invalid_rows=0,
                categories_created=0,
                transactions_created=0,
                transactions_skipped=0,
                column_mapping={},
                warnings=["CSV contained only headers (no rows)."],
                errors=[],
            )

        # Resolve expected columns (case/spacing-insensitive).
        col_map, dup_norm_headers = self._normalized_column_map(list(df_raw.columns))
        cols = self._resolve_cashew_columns(col_map)

        warnings: List[str] = []
        if dup_norm_headers:
            warnings.append(
                "Some CSV columns normalize to the same key; the importer used the first occurrence: "
                + ", ".join(sorted(dup_norm_headers))
            )

        # Required for a usable transaction.
        if not cols.get("amount") or not cols.get("date"):
            raise BadRequestError(
                "Missing required Cashew CSV columns.",
                details={
                    "required": ["amount", "date"],
                    "found": list(df_raw.columns),
                    "normalized_found": sorted(col_map.keys()),
                },
            )

        now = utc_now_iso()
        max_errors = 50
        errors: List[ImportRowError] = []

        parsed: List[Dict[str, Any]] = []
        stats: Dict[Tuple[str, str], Dict[str, Any]] = {}
        display: Dict[Tuple[str, str], Dict[str, Optional[str]]] = {}

        for i, (_, row) in enumerate(df_raw.iterrows()):
            row_num = i + 2  # header is row 1
            try:
                amount_raw = self._get_cell(row, cols["amount"])
                date_raw = self._get_cell(row, cols["date"])
                if not amount_raw.strip():
                    raise ValueError("amount is empty")
                if not date_raw.strip():
                    raise ValueError("date is empty")

                income_raw = self._get_cell(row, cols.get("income")) if cols.get("income") else ""
                income_flag = self._parse_bool(income_raw) if cols.get("income") else None

                cents = self._parse_amount_cents(amount_raw, income_flag=income_flag)
                date_str = self._parse_date(date_raw)

                merchant = self._get_cell(row, cols.get("title")).strip() if cols.get("title") else ""
                notes = self._get_cell(row, cols.get("note")).strip() if cols.get("note") else ""

                cat = self._get_cell(row, cols.get("category_name")).strip() if cols.get("category_name") else ""
                sub = (
                    self._get_cell(row, cols.get("subcategory_name")).strip()
                    if cols.get("subcategory_name")
                    else ""
                )

                # If category is missing but subcategory exists, promote subcategory.
                if (not cat) and sub:
                    cat, sub = sub, ""
                if not cat:
                    cat = "Uncategorized"

                kind = self._kind_from_cents(cents, income_flag=income_flag)

                # Normalize names for grouping.
                ncat = self._norm_name(cat)
                nsub = self._norm_name(sub) if sub else ""
                pkey = (ncat, nsub)

                display.setdefault(pkey, {"category": cat, "subcategory": sub or None})
                st = stats.setdefault(
                    pkey,
                    {
                        "income_count": 0,
                        "expense_count": 0,
                        "income_total": 0,
                        "expense_total": 0,
                    },
                )
                if kind == "income":
                    st["income_count"] += 1
                    st["income_total"] += int(max(cents, 0))
                else:
                    st["expense_count"] += 1
                    st["expense_total"] += int(max(-cents, 0))

                extras: Dict[str, str] = {}
                if preserve_extras:
                    for extra_key, col in [
                        ("account", cols.get("account")),
                        ("currency", cols.get("currency")),
                        ("income", cols.get("income")),
                        ("type", cols.get("type")),
                        ("category_name", cols.get("category_name")),
                        ("subcategory_name", cols.get("subcategory_name")),
                        ("color", cols.get("color")),
                        ("icon", cols.get("icon")),
                        ("emoji", cols.get("emoji")),
                        ("budget", cols.get("budget")),
                        ("objective", cols.get("objective")),
                    ]:
                        if col:
                            extras[f"cashew_{extra_key}"] = self._get_cell(row, col)

                parsed.append(
                    {
                        "row_num": row_num,
                        "date": date_str,
                        "amount_cents": cents,
                        "kind": kind,
                        "merchant": merchant,
                        "notes": notes,
                        "path_key": pkey,
                        "extras": extras,
                    }
                )
            except Exception as e:
                if len(errors) < max_errors:
                    errors.append(ImportRowError(row=row_num, message=str(e)))

        invalid_rows = int(len(df_raw) - len(parsed))
        if invalid_rows:
            warnings.append(f"Skipped {invalid_rows} invalid row(s).")

        # Nothing parseable -> return early
        if not parsed:
            return ImportCashewResponse(
                filename=filename,
                commit=commit,
                skip_duplicates=skip_duplicates,
                preserve_extras=preserve_extras,
                total_rows=int(len(df_raw)),
                parsed_rows=0,
                invalid_rows=int(len(df_raw)),
                categories_created=0,
                transactions_created=0,
                transactions_skipped=0,
                column_mapping=self._public_column_mapping(cols),
                warnings=warnings,
                errors=errors,
            )

        # Load existing categories/transactions to support reuse + de-dupe.
        df_cat = self.repo.read_csv(
            self.repo.categories_path, columns=CATEGORIES_COLUMNS, defaults=CATEGORIES_DEFAULTS
        )
        df_tx = self.repo.read_csv(
            self.repo.transactions_path, columns=TRANSACTIONS_COLUMNS, defaults=TRANSACTIONS_DEFAULTS
        )

        existing_root, existing_child = self._existing_category_maps(df_cat)
        existing_tx_keys = self._existing_tx_keys(df_tx) if skip_duplicates else set()

        # Create categories needed for the imported set.
        created_categories: List[Dict[str, str]] = []
        root_created: Dict[Tuple[str, str], str] = {}
        child_created: Dict[Tuple[str, str, str], str] = {}
        leaf_id_by_path_kind: Dict[Tuple[Tuple[str, str], str], str] = {}

        for pkey, st in stats.items():
            inc = int(st.get("income_count") or 0)
            exp = int(st.get("expense_count") or 0)
            if inc <= 0 and exp <= 0:
                continue

            kinds_needed: List[str] = []
            if exp > 0:
                kinds_needed.append("expense")
            if inc > 0:
                kinds_needed.append("income")

            disp = display.get(pkey) or {"category": "Uncategorized", "subcategory": None}
            base_parent = (disp.get("category") or "Uncategorized").strip() or "Uncategorized"
            base_child = (disp.get("subcategory") or None) or None

            mixed = inc > 0 and exp > 0
            majority: Optional[str] = None
            if mixed:
                if inc != exp:
                    majority = "income" if inc > exp else "expense"
                else:
                    inc_total = int(st.get("income_total") or 0)
                    exp_total = int(st.get("expense_total") or 0)
                    if inc_total != exp_total:
                        majority = "income" if inc_total > exp_total else "expense"
                    else:
                        majority = "expense"

            for kind in kinds_needed:
                parent_name = base_parent
                if mixed and majority and kind != majority:
                    suffix = "Income" if kind == "income" else "Expense"
                    if not parent_name.endswith(f" ({suffix})"):
                        parent_name = f"{parent_name} ({suffix})"

                parent_id = self._get_or_create_root_category_id(
                    kind=kind,
                    name=parent_name,
                    now=now,
                    existing_root=existing_root,
                    created_root=root_created,
                    created_rows=created_categories,
                )

                leaf_id = parent_id
                if base_child:
                    child_id = self._get_or_create_child_category_id(
                        kind=kind,
                        parent_id=parent_id,
                        name=base_child,
                        now=now,
                        existing_child=existing_child,
                        created_child=child_created,
                        created_rows=created_categories,
                    )
                    leaf_id = child_id

                leaf_id_by_path_kind[(pkey, kind)] = leaf_id

        # Create transactions, applying duplicate handling.
        new_tx_rows: List[Dict[str, Any]] = []
        new_keys: set[Tuple[str, str, str, str, str]] = set()
        skipped = 0

        for tx in parsed:
            kind = str(tx["kind"])
            pkey2 = tx["path_key"]
            leaf_id = leaf_id_by_path_kind.get((pkey2, kind))
            if not leaf_id:
                # Should not happen; keep import resilient.
                leaf_id = self._get_or_create_root_category_id(
                    kind=kind,
                    name="Uncategorized",
                    now=now,
                    existing_root=existing_root,
                    created_root=root_created,
                    created_rows=created_categories,
                )

            date_str = str(tx["date"])
            amount_str = str(int(tx["amount_cents"]))
            merchant = (tx.get("merchant") or "").strip()
            notes = (tx.get("notes") or "").strip()
            key = (date_str, amount_str, str(leaf_id), merchant, notes)
            if skip_duplicates and (key in existing_tx_keys or key in new_keys):
                skipped += 1
                continue

            new_keys.add(key)

            row = {
                "id": str(uuid.uuid4()),
                "date": date_str,
                "amount_cents": amount_str,
                "category_id": str(leaf_id),
                "merchant": merchant,
                "notes": notes,
                "created_at": now,
                "updated_at": now,
                "deleted": "false",
            }
            if preserve_extras:
                row.update(tx.get("extras") or {})
            new_tx_rows.append(row)

        categories_created_count = int(len(created_categories))

        if skip_duplicates and skipped:
            warnings.append(f"Skipped {skipped} duplicate transaction(s).")

        # Commit to disk if requested.
        if commit:
            if created_categories:
                df_cat2 = pd.concat([df_cat, pd.DataFrame(created_categories)], ignore_index=True).fillna("")
                self.repo.write_csv(
                    self.repo.categories_path,
                    df_cat2,
                    columns=CATEGORIES_COLUMNS,
                    defaults=CATEGORIES_DEFAULTS,
                )

            if new_tx_rows:
                df_tx2 = pd.concat([df_tx, pd.DataFrame(new_tx_rows)], ignore_index=True).fillna("")
                self.repo.write_csv(
                    self.repo.transactions_path,
                    df_tx2,
                    columns=TRANSACTIONS_COLUMNS,
                    defaults=TRANSACTIONS_DEFAULTS,
                )

        return ImportCashewResponse(
            filename=filename,
            commit=commit,
            skip_duplicates=skip_duplicates,
            preserve_extras=preserve_extras,
            total_rows=int(len(df_raw)),
            parsed_rows=int(len(parsed)),
            invalid_rows=invalid_rows,
            categories_created=categories_created_count,
            transactions_created=int(len(new_tx_rows)),
            transactions_skipped=int(skipped),
            column_mapping=self._public_column_mapping(cols),
            warnings=warnings,
            errors=errors,
        )

    # ----------------------------
    # Helpers
    # ----------------------------

    @staticmethod
    def _read_csv_bytes(data: bytes) -> pd.DataFrame:
        try:
            return pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False)
        except Exception as e:
            raise BadRequestError("Failed to parse CSV file.", details={"error": str(e)}) from e

    @staticmethod
    def _norm_header(name: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (name or "").strip().lower())

    @staticmethod
    def _norm_name(name: str) -> str:
        return re.sub(r"\s+", " ", (name or "").strip().lower())

    @staticmethod
    def _normalized_column_map(columns: List[str]) -> tuple[Dict[str, str], List[str]]:
        col_map: Dict[str, str] = {}
        dupes: List[str] = []
        for col in columns:
            n = ImportService._norm_header(col)
            if not n:
                continue
            if n in col_map and col_map[n] != col:
                dupes.append(n)
                continue
            col_map[n] = col
        return col_map, dupes

    @staticmethod
    def _resolve_cashew_columns(col_map: Dict[str, str]) -> Dict[str, Optional[str]]:
        def pick(*keys: str) -> Optional[str]:
            for k in keys:
                if k in col_map:
                    return col_map[k]
            return None

        # Known Cashew export headers (case/spacing-insensitive via normalization).
        return {
            "account": pick("account"),
            "amount": pick("amount"),
            "currency": pick("currency"),
            "title": pick("title"),
            "note": pick("note", "notes"),
            "date": pick("date", "notedate"),
            "income": pick("income"),
            "type": pick("type"),
            "category_name": pick("categoryname", "category"),
            "subcategory_name": pick("subcategoryname", "subcategory"),
            "color": pick("color"),
            "icon": pick("icon"),
            "emoji": pick("emoji"),
            "budget": pick("budget"),
            "objective": pick("objective"),
        }

    @staticmethod
    def _public_column_mapping(cols: Dict[str, Optional[str]]) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for k, v in cols.items():
            if v:
                out[k] = v
        return out

    @staticmethod
    def _get_cell(row: Any, col: Optional[str]) -> str:
        if not col:
            return ""
        v = row.get(col, "")
        if v is None:
            return ""
        return str(v)

    @staticmethod
    def _parse_bool(v: str) -> bool:
        return str(v).strip().lower() in {"true", "1", "yes", "y", "t"}

    @staticmethod
    def _kind_from_cents(cents: int, *, income_flag: Optional[bool]) -> str:
        if cents > 0:
            return "income"
        if cents < 0:
            return "expense"
        return "income" if income_flag else "expense"

    @staticmethod
    def _parse_date(v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("date is empty")

        # Common formats: YYYY-MM-DD, ISO datetimes, or YYYY-MM-DD HH:MM:SS.
        fmts = ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"]
        for fmt in fmts:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.date().strftime("%Y-%m-%d")
            except Exception:
                pass

        try:
            dt2 = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt2.date().strftime("%Y-%m-%d")
        except Exception as e:
            raise ValueError(f"Unrecognized date format: {s}") from e

    @staticmethod
    def _parse_amount_cents(amount_raw: str, *, income_flag: Optional[bool]) -> int:
        s = (amount_raw or "").strip()
        if not s:
            raise ValueError("amount is empty")

        explicit_negative = False
        explicit_positive = False

        if s.startswith("(") and s.endswith(")"):
            explicit_negative = True
            s = s[1:-1].strip()

        if s.startswith("-"):
            explicit_negative = True
            s = s[1:].strip()
        elif s.startswith("+"):
            explicit_positive = True
            s = s[1:].strip()

        # Keep digits and separators only.
        cleaned = re.sub(r"[^0-9\\.,]", "", s)
        if not cleaned:
            raise ValueError(f"amount is not numeric: {amount_raw}")

        # Normalize decimal separator.
        if "." in cleaned and "," in cleaned:
            # Assume comma is thousands separator: 1,234.56
            num = cleaned.replace(",", "")
        elif "," in cleaned and "." not in cleaned:
            parts = cleaned.split(",")
            if len(parts) == 2 and len(parts[1]) == 2:
                # Assume comma is decimal separator: 123,45
                num = parts[0] + "." + parts[1]
            else:
                # Assume commas are thousands separators.
                num = "".join(parts)
        else:
            num = cleaned.replace(",", "")

        try:
            dec = Decimal(num)
        except InvalidOperation as e:
            raise ValueError(f"amount is not numeric: {amount_raw}") from e

        cents_abs = int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

        if explicit_negative:
            return -cents_abs
        if explicit_positive:
            return cents_abs
        if income_flag is True:
            return cents_abs
        if income_flag is False:
            return -cents_abs
        return cents_abs

    @staticmethod
    def _existing_category_maps(
        df_cat: pd.DataFrame,
    ) -> tuple[Dict[Tuple[str, str], str], Dict[Tuple[str, str, str], str]]:
        root: Dict[Tuple[str, str], str] = {}
        child: Dict[Tuple[str, str, str], str] = {}
        if df_cat.empty:
            return root, child
        for _, row in df_cat.iterrows():
            cid = str(row.get("id") or "").strip()
            if not cid:
                continue
            kind = str(row.get("kind") or "expense").strip() or "expense"
            name = str(row.get("name") or "").strip()
            parent_id = str(row.get("parent_id") or "").strip()
            n = ImportService._norm_name(name)
            if not parent_id:
                root.setdefault((kind, n), cid)
            else:
                child.setdefault((kind, parent_id, n), cid)
        return root, child

    @staticmethod
    def _existing_tx_keys(df_tx: pd.DataFrame) -> set[Tuple[str, str, str, str, str]]:
        keys: set[Tuple[str, str, str, str, str]] = set()
        if df_tx.empty:
            return keys
        for _, row in df_tx.iterrows():
            deleted = str(row.get("deleted") or "").strip().lower()
            if deleted in {"true", "1", "yes", "y", "t"}:
                continue
            date_str = str(row.get("date") or "").strip()
            amt = str(row.get("amount_cents") or "0").strip()
            cat_id = str(row.get("category_id") or "").strip()
            merchant = str(row.get("merchant") or "").strip()
            notes = str(row.get("notes") or "").strip()
            if not date_str or not cat_id:
                continue
            try:
                amt2 = str(int(amt))
            except Exception:
                amt2 = amt
            keys.add((date_str, amt2, cat_id, merchant, notes))
        return keys

    def _get_or_create_root_category_id(
        self,
        *,
        kind: str,
        name: str,
        now: str,
        existing_root: Dict[Tuple[str, str], str],
        created_root: Dict[Tuple[str, str], str],
        created_rows: List[Dict[str, str]],
    ) -> str:
        name2 = (name or "").strip() or "Uncategorized"
        if len(name2) > 200:
            name2 = name2[:200]
        key = (kind, self._norm_name(name2))
        if key in existing_root:
            return existing_root[key]
        if key in created_root:
            return created_root[key]

        cid = str(uuid.uuid4())
        created_root[key] = cid
        created_rows.append(
            {
                "id": cid,
                "name": name2,
                "kind": kind,
                "parent_id": "",
                "active": "true",
                "created_at": now,
                "updated_at": now,
            }
        )
        return cid

    def _get_or_create_child_category_id(
        self,
        *,
        kind: str,
        parent_id: str,
        name: str,
        now: str,
        existing_child: Dict[Tuple[str, str, str], str],
        created_child: Dict[Tuple[str, str, str], str],
        created_rows: List[Dict[str, str]],
    ) -> str:
        name2 = (name or "").strip()
        if not name2:
            raise ValueError("subcategory name is empty")
        if len(name2) > 200:
            name2 = name2[:200]
        key = (kind, parent_id, self._norm_name(name2))
        if key in existing_child:
            return existing_child[key]
        if key in created_child:
            return created_child[key]

        cid = str(uuid.uuid4())
        created_child[key] = cid
        created_rows.append(
            {
                "id": cid,
                "name": name2,
                "kind": kind,
                "parent_id": parent_id,
                "active": "true",
                "created_at": now,
                "updated_at": now,
            }
        )
        return cid


