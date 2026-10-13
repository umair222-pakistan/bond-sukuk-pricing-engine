"""POST /api/v2/yield-curve/bootstrap - par curve -> zero curve, with optional pricing."""
from __future__ import annotations

import time
from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import audit
from .common import audit_block, error, internal_error, logger, read_json, validate
from .schemas import MAX_FACE, MAX_RATE, MAX_YEARS, MIN_FACE

router = APIRouter()
MAX_POINTS = 60
MAX_GRID_PERIODS = 600


class MarketPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    years: float = Field(..., strict=True, allow_inf_nan=False)
    yield_rate: float = Field(..., strict=True, allow_inf_nan=False, alias="yield")

    @field_validator("years")
    @classmethod
    def _years(cls, v: float) -> float:
        if v <= 0 or v > MAX_YEARS:
            raise ValueError("Curve point tenor must be greater than 0 and at most 50 years")
        return v

    @field_validator("yield_rate")
    @classmethod
    def _yield(cls, v: float) -> float:
        if v < 0 or v > MAX_RATE:
            raise ValueError(f"Curve yield {v * 100:g}% is outside 0-30% (AAOIFI 30% cap)")
        return v


class PriceInstrument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    face: float = Field(..., strict=True, allow_inf_nan=False)
    coupon: float = Field(..., strict=True, allow_inf_nan=False)
    years: float = Field(..., strict=True, allow_inf_nan=False)
    freq: int = Field(2, strict=True)

    @model_validator(mode="after")
    def _ranges(self) -> "PriceInstrument":
        if not MIN_FACE <= self.face <= MAX_FACE:
            raise ValueError("Face value must be between 1 and 1,000,000,000,000")
        if not 0 <= self.coupon <= MAX_RATE:
            raise ValueError(f"Profit rate {self.coupon * 100:g}% exceeds AAOIFI 30% cap")
        if not 0.01 <= self.years <= MAX_YEARS:
            raise ValueError("Tenor must be between 0.01 and 50 years")
        if not 1 <= self.freq <= 12:
            raise ValueError("Payment frequency must be between 1 and 12 per year")
        if int(round(self.years * self.freq)) < 1:
            raise ValueError("Tenor is shorter than one payment period")
        return self


class BootstrapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    curve_name: str = Field("CUSTOM", strict=True, max_length=40)
    points: list[MarketPoint] = Field(..., min_length=2, max_length=MAX_POINTS)
    freq: int = Field(2, strict=True)
    price: Optional[PriceInstrument] = None

    @field_validator("freq")
    @classmethod
    def _freq(cls, v: int) -> int:
        if v not in (1, 2, 4, 12):
            raise ValueError("Curve frequency must be 1, 2, 4 or 12 per year")
        return v

    @model_validator(mode="after")
    def _unique(self) -> "BootstrapRequest":
        years = [p.years for p in self.points]
        if len(set(years)) != len(years):
            raise ValueError("Curve points must have unique tenors")
        if int(round(max(years) * self.freq)) > MAX_GRID_PERIODS:
            raise ValueError("Curve grid is too large; reduce the longest tenor or the curve frequency")
        return self


def bootstrap(points: list[MarketPoint], freq: int) -> dict:
    """Bootstrap discount factors and zero rates from par yields (par bonds paying at ``freq``)."""
    pts = sorted(points, key=lambda p: p.years)
    xs = np.array([p.years for p in pts])
    ys = np.array([p.yield_rate for p in pts])
    n = int(round(xs[-1] * freq))
    times = np.arange(1, n + 1) / freq
    par = np.interp(times, xs, ys)  # linear between market points, flat outside
    dfs = np.empty(n)
    annuity = 0.0
    for k in range(n):  # inherently sequential: each DF depends on the earlier ones
        c = par[k] / freq
        dfs[k] = (1.0 - c * annuity) / (1.0 + c)
        annuity += dfs[k]
    if np.any(dfs <= 0):
        raise ValueError("The market data does not produce a valid discount curve (non-positive discount factor)")
    periods = np.arange(1, n + 1)
    zeros = freq * (np.power(dfs, -1.0 / periods) - 1.0)
    return {"times": times, "par": par, "dfs": dfs, "zeros": zeros, "freq": freq}


def discount_at(curve: dict, t: np.ndarray) -> np.ndarray:
    """Discount factors at arbitrary times: linear interpolation of zero rates, flat extrapolation."""
    z = np.interp(t, curve["times"], curve["zeros"])
    return np.power(1.0 + z / curve["freq"], -t * curve["freq"])


def price_with_curve(curve: dict, ins: PriceInstrument) -> dict:
    n = int(round(ins.years * ins.freq))
    t = np.arange(1, n + 1) / ins.freq
    cf = np.full(n, ins.face * ins.coupon / ins.freq)
    cf[-1] += ins.face
    df = discount_at(curve, t)
    pv = cf * df
    price = float(pv.sum())
    return {
        "price": round(price, 8),
        "premium_discount": round(price - ins.face, 8),
        "periods": n,
        "method": "PV of cash flows at bootstrapped zero rates (linear interpolation)",
        "cashflows": [{"time_years": round(float(a), 6), "cashflow": round(float(b), 8),
                       "df": round(float(c), 10), "pv": round(float(d), 8)}
                      for a, b, c, d in zip(t, cf, df, pv)],
    }


def run_bootstrap(req: BootstrapRequest) -> dict:
    started = time.perf_counter()
    curve = bootstrap(req.points, req.freq)
    out = {
        "curve_name": req.curve_name,
        "frequency": req.freq,
        "method": "Par-yield bootstrap; linear interpolation of par yields between market points",
        "market_points": [{"years": p.years, "yield": p.yield_rate}
                          for p in sorted(req.points, key=lambda p: p.years)],
        "zero_curve": [{"years": round(float(t), 6), "par_yield": round(float(p), 8),
                        "discount_factor": round(float(d), 10), "zero_rate": round(float(z), 8)}
                       for t, p, d, z in zip(curve["times"], curve["par"], curve["dfs"], curve["zeros"])],
        "replaces": "GET /api/yield-curve (static illustrative curve)",
    }
    if req.price is not None:
        out["pricing"] = price_with_curve(curve, req.price)
    out["profile"] = {"v2_time_ms": round((time.perf_counter() - started) * 1000.0, 4)}
    return out


@router.post("/yield-curve/bootstrap")
async def yield_curve_bootstrap(request: Request) -> Any:
    body, err = await read_json(request)
    if err:
        return err
    req, err = validate(BootstrapRequest, body)
    if err:
        return err
    try:
        out = run_bootstrap(req)
        price = out.get("pricing", {}).get("price")
        rec = audit.record("yield-curve/bootstrap", req.model_dump(by_alias=True), price,
                           {"path": "numpy"}, {"curve_points": len(out["zero_curve"])})
    except ValueError as exc:
        return error(400, [str(exc)])
    except Exception:
        logger.exception("bootstrap failed")
        return internal_error()
    return {**out, "audit": audit_block(rec)}
