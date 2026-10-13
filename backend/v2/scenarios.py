"""POST /api/v2/scenarios - early redemption, step-up profit rate and callable what-ifs."""
from __future__ import annotations

import time
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from . import audit, engine
from .common import audit_block, internal_error, logger, price_cached, read_json, request_inputs, validate
from .schemas import MAX_RATE, AdvancedRequest, friendly_errors

router = APIRouter()
MAX_SCENARIOS = 20


def _num(**kw: Any) -> Any:
    return Field(strict=True, allow_inf_nan=False, **kw)


class EarlyRedemption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["early_redemption"]
    redemption_year: float = _num()
    yield_bump_bps: float = _num(default=0.0)
    purchase_price_pct: float = _num(default=100.0)


class StepUp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["step_up"]
    after_years: float = _num()
    step_up_bps: float = _num()


class CallableSukuk(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["callable"]
    call_year: float = _num()
    call_price_pct: float = _num(default=100.0)


MODELS = {"early_redemption": EarlyRedemption, "step_up": StepUp, "callable": CallableSukuk}


class ScenarioRequest(AdvancedRequest):
    scenarios: list[dict] = Field(..., min_length=1)

    @field_validator("scenarios")
    @classmethod
    def _count(cls, v: list[dict]) -> list[dict]:
        if len(v) > MAX_SCENARIOS:
            raise ValueError(f"At most {MAX_SCENARIOS} scenarios are allowed per request")
        return v


def _period_for(year: float, freq: int, n: int, label: str) -> int:
    k = int(round(year * freq))
    if year <= 0 or k < 1 or k >= n:
        raise ValueError(f"{label} must fall after the first period and before maturity "
                         f"(between {1 / freq:g} and {(n - 1) / freq:g} years)")
    return k


def _pv(cfs: np.ndarray, freq: int, annual_yield: float) -> float:
    return float(engine.prices_at_yields(cfs, freq, [annual_yield])[0])


def _early_redemption(req: ScenarioRequest, sc: EarlyRedemption, n: int) -> dict:
    k = _period_for(sc.redemption_year, req.freq, n, "Redemption year")
    if not 0 < sc.purchase_price_pct <= 200:
        raise ValueError("Asset purchase price must be between 0 and 200% of face")
    y = req.yield_rate + sc.yield_bump_bps / 10000.0
    if not 0 <= y <= MAX_RATE:
        raise ValueError("Yield after the bump must stay between 0% and the AAOIFI 30% cap")
    payment = engine.periodic_payment(req.face, req.coupon, req.freq, req.day_count.value)
    flows = np.full(k, payment)
    flows[-1] += req.face * sc.purchase_price_pct / 100.0
    return {
        "price": _pv(np.round(flows, 8), req.freq, y),
        "description": (f"Issuer exercises the asset purchase undertaking at year {k / req.freq:g} "
                        f"for {sc.purchase_price_pct:g}% of face; discounted at {y * 100:.4g}%"),
        "periods_to_cashflow": k,
    }


def _step_up(req: ScenarioRequest, sc: StepUp, n: int) -> dict:
    k = _period_for(sc.after_years, req.freq, n, "Step-up year")
    new_rate = req.coupon + sc.step_up_bps / 10000.0
    if new_rate < 0:
        raise ValueError("Profit rate after the step-up cannot be negative")
    if new_rate > MAX_RATE:
        raise ValueError(f"Profit rate {new_rate * 100:g}% exceeds AAOIFI 30% cap")
    day_count = req.day_count.value
    flows = np.full(n, engine.periodic_payment(req.face, req.coupon, req.freq, day_count))
    flows[k:] = engine.periodic_payment(req.face, new_rate, req.freq, day_count)
    flows[-1] += req.face
    return {
        "price": _pv(np.round(flows, 8), req.freq, req.yield_rate),
        "description": (f"Profit rate steps from {req.coupon * 100:.4g}% to {new_rate * 100:.4g}% "
                        f"after year {k / req.freq:g}"),
        "periods_to_cashflow": n,
    }


def _callable(req: ScenarioRequest, sc: CallableSukuk, n: int) -> dict:
    k = _period_for(sc.call_year, req.freq, n, "Call year")
    if not 0 < sc.call_price_pct <= 200:
        raise ValueError("Call price must be between 0 and 200% of face")
    payment = engine.periodic_payment(req.face, req.coupon, req.freq, req.day_count.value)
    flows = np.full(k, payment)
    flows[-1] += req.face * sc.call_price_pct / 100.0
    return {
        "price": _pv(np.round(flows, 8), req.freq, req.yield_rate),
        "description": (f"Price to call at year {k / req.freq:g} for {sc.call_price_pct:g}% of face "
                        "(issuer purchase option)"),
        "periods_to_cashflow": k,
    }


def run_scenarios(req: ScenarioRequest) -> dict:
    started = time.perf_counter()
    base_res, hit = price_cached(req)
    base = base_res["price"]
    n = base_res["inputs"]["periods"]
    results: list[dict] = []
    failures: list[dict] = []
    for index, raw in enumerate(req.scenarios):
        kind = raw.get("type")
        model = MODELS.get(kind)
        if model is None:
            failures.append({"index": index, "error": "Scenario type must be early_redemption, step_up or callable"})
            continue
        try:
            sc = model.model_validate(raw)
        except ValidationError as exc:
            failures.append({"index": index, "type": kind, "error": friendly_errors(exc.errors())[0]})
            continue
        try:
            if kind == "early_redemption":
                out = _early_redemption(req, sc, n)
            elif kind == "step_up":
                out = _step_up(req, sc, n)
            else:
                out = _callable(req, sc, n)
        except ValueError as exc:
            failures.append({"index": index, "type": kind, "error": str(exc)})
            continue
        price = out["price"]
        results.append({
            "index": index,
            "type": kind,
            "parameters": {k: v for k, v in raw.items() if k != "type"},
            "description": out["description"],
            "scenario_price": round(price, 8),
            "base_price": base,
            "impact": round(price - base, 8),
            "impact_pct": round((price - base) / base * 100.0, 6) if base else 0.0,
            "price_to_worst": round(min(price, base), 8) if kind == "callable" else None,
            "periods_to_cashflow": out["periods_to_cashflow"],
        })
    return {
        "inputs": request_inputs(req),
        "base_price": base,
        "scenarios": results,
        "errors": failures,
        "profile": {"v2_time_ms": round((time.perf_counter() - started) * 1000.0, 4), "cache_hit": hit},
    }


@router.post("/scenarios")
async def scenarios(request: Request) -> Any:
    body, err = await read_json(request)
    if err:
        return err
    req, err = validate(ScenarioRequest, body)
    if err:
        return err
    try:
        out = run_scenarios(req)
        rec = audit.record("scenarios", {**out["inputs"], "scenarios": req.scenarios}, out["base_price"],
                           {"path": "numpy"}, {"scenario_count": len(out["scenarios"])})
    except Exception:
        logger.exception("scenarios failed")
        return internal_error()
    return {**out, "audit": audit_block(rec)}
