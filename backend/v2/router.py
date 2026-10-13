"""POST /api/v2/calculate/advanced - vectorised pricing with profiling and V1 parity check."""
from __future__ import annotations

import copy
import logging
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from . import analytics, audit, audit_routes, batch, curve, engine, scenarios, security
from .cache import LRUCache, make_key
from .common import audit_block, request_inputs
from .schemas import AdvancedRequest, friendly_errors

logger = logging.getLogger("noorfinance.v2")

router = APIRouter(prefix="/api/v2", tags=["v2"])
cache = LRUCache(512)

PARITY_TOLERANCE = 1e-6


def _v1():
    """Import the V1 module lazily (works as ``backend.main`` and as ``main``)."""
    try:
        from backend import main as v1
    except ImportError:  # started from inside backend/ (e.g. render.yaml)
        import main as v1  # type: ignore[no-redef]
    return v1


def _error(status: int, messages: list[str]) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": "validation_failed", "message": messages[0], "details": messages},
    )


def _run_v1(req: AdvancedRequest, kind: str) -> dict:
    v1 = _v1()
    v1_req = v1.InstrumentRequest(
        face=req.face, coupon=req.coupon, **{"yield": req.yield_rate}, years=req.years, freq=req.freq
    )
    return v1.value_instrument(v1_req, principal_at_maturity=True, kind=kind)


def compute_advanced(req: AdvancedRequest) -> tuple[dict, dict, bool]:
    """Return (payload, profile, cache_hit) for a validated request."""
    kind = "ijara_sukuk" if req.structure == "sukuk" else "conventional_bond"
    key = make_key(
        {
            "face": req.face,
            "coupon": req.coupon,
            "yield": req.yield_rate,
            "years": req.years,
            "freq": req.freq,
            "structure": req.structure,
            "day_count": req.day_count,
        }
    )

    start = time.perf_counter()
    cached = cache.get(key)
    if cached is not None:
        payload = copy.deepcopy(cached["payload"])
        v2_ms = (time.perf_counter() - start) * 1000.0
        v1_ms = cached["v1_time_ms"]
        return payload, _profile(v1_ms, v2_ms, True, key), True

    day_count = req.day_count.value
    v2_ms = engine.benchmark(
        lambda: engine.value_instrument_v2(
            req.face, req.coupon, req.yield_rate, req.years, req.freq, kind, day_count
        ),
        repeats=3,
        inner=3,
    )
    v2_result = engine.value_instrument_v2(
        req.face, req.coupon, req.yield_rate, req.years, req.freq, kind, day_count
    )
    v1_ms = engine.benchmark(lambda: _run_v1(req, kind), repeats=3, inner=3)
    v1_result = _run_v1(req, kind)

    warnings: list[str] = []
    comparable = day_count == engine.THIRTY_360
    v1_price = v1_result["price"]
    diff = abs(v1_price - v2_result["price"]) if comparable else None
    if comparable and diff is not None and diff >= PARITY_TOLERANCE:
        warnings.append(f"V1/V2 price difference {diff:.3e} exceeds tolerance {PARITY_TOLERANCE:g}")
    if not comparable:
        warnings.append("ACT/365 is a V2-only convention; V1 parity check applies to 30/360 only")
    if abs(req.years * req.freq - v2_result["inputs"]["periods"]) > 1e-9:
        warnings.append(
            f"Tenor {req.years:g}y at {req.freq} payments/year was rounded to "
            f"{v2_result['inputs']['periods']} whole periods"
        )

    payload = {
        "result": v2_result,
        "v1_price": v1_price,
        "v2_price": v2_result["price"],
        "price_diff": diff,
        "parity_ok": (diff is not None and diff < PARITY_TOLERANCE) if comparable else None,
        "warnings": warnings,
    }
    cache.set(key, {"payload": copy.deepcopy(payload), "v1_time_ms": v1_ms})
    logger.info("v2 calc key=%s v1=%.3fms v2=%.3fms", key[:12], v1_ms, v2_ms)
    return payload, _profile(v1_ms, v2_ms, False, key), False


def _profile(v1_ms: float, v2_ms: float, hit: bool, key: str) -> dict:
    return {
        "v1_time_ms": round(v1_ms, 4),
        "v2_time_ms": round(v2_ms, 4),
        "speedup": round(v1_ms / v2_ms, 2) if v2_ms > 0 else None,
        "cache_hit": hit,
        "cache_key": key,
    }


@router.post("/calculate/advanced")
async def calculate_advanced(request: Request) -> Any:
    try:
        body = await request.json()
    except Exception:
        return _error(400, ["Request body must be valid JSON"])
    if not isinstance(body, dict):
        return _error(400, ["Request body must be a JSON object"])
    try:
        req = AdvancedRequest.model_validate(body)
    except ValidationError as exc:
        return _error(400, friendly_errors(exc.errors()))
    try:
        payload, profile, _ = compute_advanced(req)
    except Exception:
        logger.exception("v2 calculation failed")
        return JSONResponse(
            status_code=500,
            content={
                "error": "calculation_failed",
                "message": "The calculation could not be completed. Please review the inputs and try again.",
            },
        )
    rec = audit.record(
        "calculate/advanced",
        request_inputs(req),
        payload["v2_price"],
        {"path": payload["result"]["engine"]["path"]},
    )
    body = {**payload, "profile": profile, "audit": audit_block(rec)}
    return JSONResponse(content=jsonable_encoder(body), headers={"X-Audit-ID": rec["id"]})


# Phase 2 endpoint modules, all served under /api/v2.
router.include_router(analytics.router)
router.include_router(batch.router)
router.include_router(scenarios.router)
router.include_router(curve.router)
router.include_router(audit_routes.router)
router.include_router(security.router)
