"""POST /api/v2/sensitivity and POST /api/v2/compare."""
from __future__ import annotations

import time
from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import audit, compliance, engine
from .common import (audit_block, error, internal_error, kind_for, logger, metrics, price_cached, read_json,
                     request_inputs, validate)
from .schemas import AdvancedRequest

router = APIRouter()

DV01_TOLERANCE_30_360 = 1e-4
DV01_TOLERANCE_ACT_365 = 1e-2  # ACT/365 time basis differs slightly from periodic discounting


def _r(x: Any, digits: int = 6) -> float:
    return round(float(x), digits)


class SensitivityRequest(AdvancedRequest):
    max_bump_bps: int = Field(300, strict=True, description="Largest parallel shock, in basis points")
    step_bps: int = Field(25, strict=True, description="Shock grid step, in basis points")

    @field_validator("max_bump_bps")
    @classmethod
    def _max(cls, v: int) -> int:
        if v < 1 or v > 1000:
            raise ValueError("Maximum bump must be between 1 and 1000 basis points")
        return v

    @field_validator("step_bps")
    @classmethod
    def _step(cls, v: int) -> int:
        if v < 1 or v > 500:
            raise ValueError("Bump step must be between 1 and 500 basis points")
        return v

    @model_validator(mode="after")
    def _grid(self) -> "SensitivityRequest":
        if self.max_bump_bps % self.step_bps:
            raise ValueError("Maximum bump must be a multiple of the bump step")
        return self


def run_sensitivity(req: SensitivityRequest) -> dict:
    started = time.perf_counter()
    result, hit = price_cached(req)
    day_count = req.day_count.value
    cfs = engine.cashflow_array(req.face, req.coupon, req.years, req.freq, day_count)
    base = result["price"]
    mod, conv = result["modified_duration"], result["convexity"]

    bumps = np.arange(-req.max_bump_bps, req.max_bump_bps + 1, req.step_bps)
    raw = req.yield_rate + bumps / 10000.0
    yields = np.maximum(raw, 0.0)
    prices = engine.prices_at_yields(cfs, req.freq, yields)
    dy = yields - req.yield_rate
    approx = base * (1.0 - mod * dy + 0.5 * conv * dy ** 2)
    table = [
        {
            "bump_bps": int(b),
            "yield": _r(y, 6),
            "price": _r(p),
            "change": _r(p - base),
            "change_pct": _r((p - base) / base * 100.0 if base else 0.0),
            "duration_convexity_price": _r(a),
            "approximation_error": _r(a - p),
            "yield_floored_at_zero": bool(f < 0),
        }
        for b, y, p, a, f in zip(bumps.tolist(), yields.tolist(), prices.tolist(), approx.tolist(), raw.tolist())
    ]

    h = 0.0001
    y_dn, y_up = max(req.yield_rate - h, 0.0), req.yield_rate + h
    p_dn, p_up = engine.prices_at_yields(cfs, req.freq, [y_dn, y_up]).tolist()
    slope = (p_dn - p_up) / (y_up - y_dn)
    numeric_dv01 = slope * h
    numeric_mod = slope / base if base else 0.0
    analytic = result["dv01"]
    abs_diff = abs(analytic - numeric_dv01)
    rel_diff = abs_diff / abs(analytic) if analytic else 0.0
    tolerance = DV01_TOLERANCE_ACT_365 if day_count == engine.ACT_365 else DV01_TOLERANCE_30_360

    warnings: list[str] = []
    if any(row["yield_floored_at_zero"] for row in table):
        warnings.append("Downward shocks that would take the yield below 0% were floored at 0%")
    if day_count == engine.ACT_365:
        warnings.append("ACT/365 uses an approximate period length; DV01 parity tolerance is relaxed to 1%")
    return {
        "inputs": {**request_inputs(req), "max_bump_bps": req.max_bump_bps, "step_bps": req.step_bps},
        "base": metrics(result),
        "dv01": {
            "analytic": analytic,
            "numeric": _r(numeric_dv01, 8),
            "abs_diff": _r(abs_diff, 8),
            "rel_diff": _r(rel_diff, 8),
            "tolerance": tolerance,
            "parity_ok": bool(rel_diff <= tolerance),
        },
        "numeric_modified_duration": _r(numeric_mod, 8),
        "table_points": len(table),
        "table": table,
        "warnings": warnings,
        "profile": {"v2_time_ms": _r((time.perf_counter() - started) * 1000.0, 4), "cache_hit": hit},
    }


@router.post("/sensitivity")
async def sensitivity(request: Request) -> Any:
    body, err = await read_json(request)
    if err:
        return err
    req, err = validate(SensitivityRequest, body)
    if err:
        return err
    try:
        out = run_sensitivity(req)
        rec = audit.record("sensitivity", out["inputs"], out["base"]["price"], {"path": "numpy"})
    except Exception:
        logger.exception("sensitivity failed")
        return internal_error()
    body = {**out, "audit": audit_block(rec)}
    return JSONResponse(content=jsonable_encoder(body), headers={"X-Audit-ID": rec["id"]})


# --------------------------------------------------------------------------
# Compare: bond vs sukuk
# --------------------------------------------------------------------------
ASSET_BASED_TYPES = ("ijara", "musharaka", "mudaraba", "wakala", "diminishing_musharaka")
SUKUK_EXTRAS = ("underlying_asset", "asset_backed", "principal_guaranteed")
DIFF_KEYS = ("price", "premium_discount", "macaulay_duration", "modified_duration", "convexity", "dv01")


def _sukuk_request(body: Any) -> tuple[Optional[AdvancedRequest], Optional[dict], Optional[Any]]:
    """Validate the sukuk leg. Returns (pricing request, compliance extras, error response)."""
    if not isinstance(body, dict):
        return None, None, error(400, ["Sukuk: leg must be a JSON object"])
    raw_type = body.get("structure")
    if not isinstance(raw_type, str) or not raw_type.strip():
        return None, None, error(
            400, ["Sukuk: a Shariah structure (e.g. ijara) is required; interest-bearing debt is not a sukuk"])
    kind = compliance.normalise_type(raw_type)
    if kind not in compliance.SUKUK_TYPES:
        return None, None, error(
            400, [f"Sukuk: '{raw_type}' is not a recognised sukuk structure "
                  f"({', '.join(compliance.SUKUK_TYPES)})"])
    pricing = {k: v for k, v in body.items() if k not in SUKUK_EXTRAS and k != "structure"}
    pricing["structure"] = "sukuk"
    asset = body.get("underlying_asset")
    backed = body.get("asset_backed")
    guaranteed = body.get("principal_guaranteed", False)
    if asset is not None and not isinstance(asset, str):
        return None, None, error(400, ["Sukuk: underlying asset must be text"])
    if backed is not None and not isinstance(backed, bool):
        return None, None, error(400, ["Sukuk: asset-backed flag must be true or false"])
    if not isinstance(guaranteed, bool):
        return None, None, error(400, ["Sukuk: principal-guaranteed flag must be true or false"])
    extras = {
        "structure_type": kind,
        "underlying_asset": asset,
        "asset_backed": backed,
        "asset_backed_inferred": backed is None,
        "principal_guaranteed": guaranteed,
    }
    return pricing, extras, None


def _profit_view(result: dict, profit_rate: float) -> dict:
    cf = result["closed_form"]
    return {
        **metrics(result),
        "profit_rate": profit_rate,
        "periodic_profit_payment": cf["periodic_payment"],
        "pv_profit_payments": cf["pv_coupons_or_rentals"],
        "pv_principal": cf["pv_principal"],
        "label": "profit",
    }


@router.post("/compare")
async def compare(request: Request) -> Any:
    body, err = await read_json(request)
    if err:
        return err
    if not isinstance(body, dict) or not isinstance(body.get("bond"), dict) or "sukuk" not in body:
        return error(400, ["Request must contain 'bond' and 'sukuk' objects"])
    bond_body = {**body["bond"], "structure": "bond"}
    bond_req, err = validate(AdvancedRequest, bond_body, "Bond")
    if err:
        return err
    pricing, extras, err = _sukuk_request(body["sukuk"])
    if err:
        return err
    pricing.setdefault("yield", bond_req.yield_rate)  # same discount rate unless the caller overrides
    yield_defaulted = "yield" not in body["sukuk"]
    sukuk_req, err = validate(AdvancedRequest, pricing, "Sukuk")
    if err:
        return err
    try:
        started = time.perf_counter()
        bond_res, bond_hit = price_cached(bond_req)
        sukuk_res, sukuk_hit = price_cached(sukuk_req)

        backed = extras["asset_backed"]
        if backed is None:
            backed = extras["structure_type"] in ASSET_BASED_TYPES
        comp = compliance.evaluate(
            extras["structure_type"], extras["underlying_asset"], sukuk_req.years,
            sukuk_req.coupon, backed, extras["principal_guaranteed"])
        bond_comp = compliance.evaluate(
            "conventional_bond", None, bond_req.years, bond_req.coupon, False, True)

        bond_view = metrics(bond_res)
        sukuk_view = _profit_view(sukuk_res, sukuk_req.coupon)
        diff = {k: _r(sukuk_view[k] - bond_view[k], 8) for k in DIFF_KEYS}
        notes = []
        if extras["asset_backed_inferred"]:
            notes.append(f"Asset-backing inferred from the '{extras['structure_type']}' structure; "
                         "confirm with the offering documents")
        if yield_defaulted:
            notes.append("Sukuk discount yield defaulted to the bond yield for like-for-like comparison")
        inputs = {"bond": request_inputs(bond_req), "sukuk": {**request_inputs(sukuk_req), **{
            k: extras[k] for k in ("structure_type", "underlying_asset", "asset_backed", "principal_guaranteed")}}}
        rec = audit.record("compare", inputs, {"bond": bond_view["price"], "sukuk": sukuk_view["price"]},
                           {"path": "python"}, {"compliance_score": comp["score"]})
        elapsed = _r((time.perf_counter() - started) * 1000.0, 4)
    except Exception:
        logger.exception("compare failed")
        return internal_error()
    return {
        "bond": {"pricing": bond_view, "compliance_score": bond_comp["score"]},
        "sukuk": {"pricing": sukuk_view, "structure": extras["structure_type"],
                  "compliance": comp},
        "difference": {"sukuk_minus_bond": diff, "price_pct": _r(diff["price"] / bond_view["price"] * 100.0, 4)},
        "compliance_score": comp["score"],
        "disclaimer": compliance.DISCLAIMER,
        "notes": notes,
        "audit": audit_block(rec),
        "profile": {"v2_time_ms": elapsed, "cache_hit": bond_hit and sukuk_hit},
    }
