"""Shared helpers for the V2 endpoint modules (errors, parsing, cached pricing, audit blocks)."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional, Type, TypeVar

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from . import engine
from .cache import LRUCache, make_key
from .schemas import AdvancedRequest, friendly_errors

logger = logging.getLogger("noorfinance.v2")

T = TypeVar("T", bound=BaseModel)

pricing_cache = LRUCache(512)

INTERNAL_MESSAGE = "The calculation could not be completed. Please review the inputs and try again."


def v1_module():
    """Import the V1 module lazily (works as ``backend.main`` and as ``main``)."""
    try:
        from backend import main as v1
    except ImportError:  # started from inside backend/ (render.yaml)
        import main as v1  # type: ignore[no-redef]
    return v1


def error(status: int, messages: list[str], code: str = "validation_failed") -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "message": messages[0], "details": messages})


def internal_error() -> JSONResponse:
    return error(500, [INTERNAL_MESSAGE], "calculation_failed")


async def read_json(request: Request, allow_empty: bool = False) -> tuple[Any, Optional[JSONResponse]]:
    raw = await request.body()
    if not raw.strip():
        if allow_empty:
            return {}, None
        return None, error(400, ["Request body must be valid JSON"])
    try:
        return json.loads(raw), None
    except ValueError:
        return None, error(400, ["Request body must be valid JSON"])


def validate(model: Type[T], body: Any, prefix: str = "") -> tuple[Optional[T], Optional[JSONResponse]]:
    if not isinstance(body, dict):
        return None, error(400, ["Request body must be a JSON object"])
    try:
        return model.model_validate(body), None
    except ValidationError as exc:
        messages = friendly_errors(exc.errors())
        if prefix:
            messages = [f"{prefix}: {m}" for m in messages]
        return None, error(400, messages)


def kind_for(structure: str) -> str:
    return "ijara_sukuk" if structure == "sukuk" else "conventional_bond"


def request_inputs(req: AdvancedRequest) -> dict:
    return {
        "face": req.face,
        "coupon": req.coupon,
        "yield": req.yield_rate,
        "years": req.years,
        "freq": req.freq,
        "structure": req.structure,
        "day_count": req.day_count.value,
    }


def price_cached(req: AdvancedRequest) -> tuple[dict, bool]:
    """Lightweight cached V2 pricing (no V1 parity run). Returned dict is read-only."""
    key = make_key(request_inputs(req))
    cached = pricing_cache.get(key)
    if cached is not None:
        return cached, True
    result = engine.value_instrument_v2(
        req.face, req.coupon, req.yield_rate, req.years, req.freq, kind_for(req.structure), req.day_count.value
    )
    pricing_cache.set(key, result)
    return result, False


def metrics(result: dict) -> dict:
    return {
        "price": result["price"],
        "premium_discount": result["premium_discount"],
        "quote_vs_par": result["quote_vs_par"],
        "macaulay_duration": result["macaulay_duration"],
        "modified_duration": result["modified_duration"],
        "convexity": result["convexity"],
        "dv01": result["dv01"],
        "periods": result["inputs"]["periods"],
    }


def audit_block(rec: dict) -> dict:
    return {"id": rec["id"], "input_hash": rec["input_hash"], "timestamp": rec["timestamp"]}
