"""In-memory audit trail for V2 calculations (LRU 1000; a DB can replace the store later)."""
from __future__ import annotations

import hashlib
import json
import threading
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

import numpy as np

MAX_RECORDS = 1000
SCHEMA_VERSION = "1.0"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def input_hash(inputs: Any) -> str:
    return hashlib.sha256(canonical_json(inputs).encode("utf-8")).hexdigest()


class AuditStore:
    """Thread-safe LRU store keyed by audit UUID."""

    def __init__(self, maxsize: int = MAX_RECORDS) -> None:
        self.maxsize = maxsize
        self._data: "OrderedDict[str, dict]" = OrderedDict()
        self._lock = threading.Lock()

    def add(self, rec: dict) -> None:
        with self._lock:
            self._data[rec["id"]] = rec
            self._data.move_to_end(rec["id"])
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def get(self, audit_id: str) -> Optional[dict]:
        with self._lock:
            rec = self._data.get(audit_id)
            return dict(rec) if rec is not None else None

    def all(self) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._data.values()]

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


store = AuditStore()


def record(
    endpoint: str,
    inputs: Any,
    price: Any,
    engine_info: Optional[dict] = None,
    summary: Optional[dict] = None,
) -> dict:
    """Create and store an audit record for one calculation."""
    safe_inputs = json.loads(canonical_json(inputs))
    rec = {
        "id": str(uuid.uuid4()),
        "schema_version": SCHEMA_VERSION,
        "endpoint": endpoint,
        "input_hash": input_hash(safe_inputs),
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "engine": {"name": "noorfinance-v2", "numpy": np.__version__, **(engine_info or {})},
        "price": price,
        "summary": json.loads(canonical_json(summary)) if summary else None,
        "inputs": safe_inputs,
    }
    store.add(rec)
    return dict(rec)


def export(ids: Optional[Iterable[str]] = None) -> dict:
    """Build a Shariah-Board exportable JSON document with an integrity hash."""
    missing: list[str] = []
    if ids is None:
        records = store.all()
    else:
        records = []
        for audit_id in ids:
            rec = store.get(str(audit_id))
            if rec is None:
                missing.append(str(audit_id))
            else:
                records.append(rec)
    return {
        "export_type": "noorfinance.audit_trail",
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(records),
        "missing_ids": missing,
        "integrity_sha256": hashlib.sha256(canonical_json(records).encode("utf-8")).hexdigest(),
        "records": records,
    }
