"""Thread-safe LRU cache with canonical SHA-256 keys for V2 calculations."""
from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from typing import Any, Mapping, Optional

DEFAULT_MAXSIZE = 512

KEY_FIELDS = ("face", "coupon", "yield", "years", "freq", "structure", "day_count")


def make_key(params: Mapping[str, Any]) -> str:
    """SHA-256 of the canonical JSON of the pricing parameters.

    Numbers are normalised to float/int and keys are sorted, so logically equal
    inputs always hash identically regardless of dict ordering or int/float form.
    """
    canonical: dict[str, Any] = {}
    for name in KEY_FIELDS:
        if name not in params:
            continue
        value = params[name]
        value = getattr(value, "value", value)  # Enum -> raw value
        if name == "freq":
            value = int(value)
        elif name in ("face", "coupon", "yield", "years"):
            value = float(value)
        canonical[name] = value
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class LRUCache:
    """Least-recently-used mapping guarded by a lock."""

    def __init__(self, maxsize: int = DEFAULT_MAXSIZE) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be at least 1")
        self.maxsize = maxsize
        self._data: "OrderedDict[str, Any]" = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                self.hits += 1
                return self._data[key]
            self.misses += 1
            return None

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
            self.hits = 0
            self.misses = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def stats(self) -> dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "size": len(self._data),
                "maxsize": self.maxsize,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / total, 4) if total else 0.0,
            }
