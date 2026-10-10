from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import uvicorn

app = FastAPI(
    title="Bond & Sukuk Pricing Engine",
    version="1.0.0",
    description="Closed-form and cash-flow pricing for conventional bonds and Ijara sukuk.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://noorfinance.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InstrumentRequest(BaseModel):
    face: float = Field(..., gt=0, description="Par / face value")
    coupon: float = Field(..., ge=0, description="Annual coupon or rental rate as decimal, e.g. 0.06")
    yield_rate: float = Field(..., ge=0, alias="yield", description="Annual yield as decimal, e.g. 0.05")
    years: float = Field(..., gt=0)
    freq: int = Field(2, ge=1, le=12, description="Payments per year")
    instrument: Literal["bond", "ijara"] = "bond"

    model_config = {"populate_by_name": True}

    @field_validator("coupon", "yield_rate")
    @classmethod
    def as_decimal(cls, v: float) -> float:
        if v > 1.5:
            return v / 100.0
        return v


class DurationRequest(InstrumentRequest):
    pass


def periodic_rate(annual: float, freq: int) -> float:
    return annual / freq


def periods(years: float, freq: int) -> int:
    n = int(round(years * freq))
    if n < 1:
        raise HTTPException(status_code=400, detail="Tenor must produce at least one period.")
    return n


def discount_factor(i: float, t: float) -> float:
    return 1.0 / ((1.0 + i) ** t)


def a_angle_n(i: float, n: int) -> float:
    """Present value of an annuity-immediate: a-angle-n = (1 - v^n) / i."""
    if abs(i) < 1e-12:
        return float(n)
    v_n = discount_factor(i, n)
    return (1.0 - v_n) / i


def s_angle_n(i: float, n: int) -> float:
    """Accumulated value of an annuity-immediate: s-angle-n = ((1+i)^n - 1) / i."""
    if abs(i) < 1e-12:
        return float(n)
    return (((1.0 + i) ** n) - 1.0) / i


def cashflows(face: float, coupon_annual: float, n: int, freq: int, principal_at_maturity: bool) -> list[dict]:
    payment = face * coupon_annual / freq
    rows: list[dict] = []
    for t in range(1, n + 1):
        principal = face if (principal_at_maturity and t == n) else 0.0
        cf = payment + principal
        rows.append(
            {
                "period": t,
                "time_years": t / freq,
                "coupon_or_rental": round(payment, 8),
                "principal": round(principal, 8),
                "cashflow": round(cf, 8),
            }
        )
    return rows


def price_from_cashflows(cfs: list[dict], i: float) -> tuple[float, list[dict]]:
    priced = []
    total = 0.0
    for row in cfs:
        t = row["period"]
        pv = row["cashflow"] * discount_factor(i, t)
        total += pv
        priced.append({**row, "df": round(discount_factor(i, t), 10), "pv": round(pv, 8)})
    return total, priced


def closed_form_price(face: float, coupon_annual: float, i: float, n: int, freq: int) -> dict:
    """PV = C * a-angle-n + F * v^n  (coupon/rental C per period)."""
    c = face * coupon_annual / freq
    annuity = a_angle_n(i, n)
    v_n = discount_factor(i, n)
    pv_coupons = c * annuity
    pv_principal = face * v_n
    return {
        "periodic_payment": c,
        "a_angle_n": annuity,
        "s_angle_n": s_angle_n(i, n),
        "v_n": v_n,
        "pv_coupons_or_rentals": pv_coupons,
        "pv_principal": pv_principal,
        "price": pv_coupons + pv_principal,
    }


def macaulay_duration(priced: list[dict], price: float, freq: int) -> float:
    if price <= 0:
        return 0.0
    weighted = sum(row["period"] / freq * row["pv"] for row in priced)
    return weighted / price


def modified_duration(mac: float, i: float, freq: int) -> float:
    return mac / (1.0 + i)


def convexity(cfs: list[dict], i: float, price: float, freq: int) -> float:
    """Annual convexity: (1/P) * sum t(t+1) CF / (1+i)^{t+2} / freq^2."""
    if price <= 0:
        return 0.0
    raw = 0.0
    for row in cfs:
        t = row["period"]
        raw += t * (t + 1) * row["cashflow"] * discount_factor(i, t + 2)
    return raw / (price * (freq ** 2))


def price_yield_curve(face: float, coupon_annual: float, years: float, freq: int, principal: bool) -> list[dict]:
    n = periods(years, freq)
    points = []
    for bps in range(0, 2001, 25):
        y = bps / 10000.0
        i = periodic_rate(y, freq)
        cfs = cashflows(face, coupon_annual, n, freq, principal)
        px, _ = price_from_cashflows(cfs, i)
        points.append({"yield": round(y, 4), "price": round(px, 6)})
    return points


def value_instrument(req: InstrumentRequest, principal_at_maturity: bool, kind: str) -> dict:
    n = periods(req.years, req.freq)
    i = periodic_rate(req.yield_rate, req.freq)
    cfs = cashflows(req.face, req.coupon, n, req.freq, principal_at_maturity)
    dcf_price, priced = price_from_cashflows(cfs, i)
    closed = closed_form_price(req.face, req.coupon, i, n, req.freq)
    mac = macaulay_duration(priced, dcf_price, req.freq)
    mod = modified_duration(mac, i, req.freq)
    conv = convexity(cfs, i, dcf_price, req.freq)
    par_spread = req.coupon - req.yield_rate
    return {
        "instrument": kind,
        "inputs": {
            "face": req.face,
            "coupon": req.coupon,
            "yield": req.yield_rate,
            "years": req.years,
            "freq": req.freq,
            "periods": n,
            "periodic_yield": i,
        },
        "formulas": {
            "pv": "sum CF_t / (1+i)^t",
            "a_angle_n": "(1 - v^n) / i",
            "s_angle_n": "((1+i)^n - 1) / i",
            "duration": "sum t * PV(CF_t) / Price",
            "convexity": "sum t(t+1) CF_t / (1+i)^{t+2} / (Price * freq^2)",
        },
        "closed_form": {
            "periodic_payment": round(closed["periodic_payment"], 8),
            "a_angle_n": round(closed["a_angle_n"], 10),
            "s_angle_n": round(closed["s_angle_n"], 10),
            "v_n": round(closed["v_n"], 10),
            "pv_coupons_or_rentals": round(closed["pv_coupons_or_rentals"], 8),
            "pv_principal": round(closed["pv_principal"], 8),
            "price": round(closed["price"], 8),
        },
        "price": round(dcf_price, 8),
        "dirty_price": round(dcf_price, 8),
        "premium_discount": round(dcf_price - req.face, 8),
        "quote_vs_par": "premium" if dcf_price > req.face + 1e-8 else ("discount" if dcf_price < req.face - 1e-8 else "par"),
        "macaulay_duration": round(mac, 8),
        "modified_duration": round(mod, 8),
        "convexity": round(conv, 8),
        "dv01": round(mod * dcf_price / 10000.0, 8),
        "coupon_minus_yield": round(par_spread, 8),
        "cashflows": priced,
        "price_yield_curve": price_yield_curve(req.face, req.coupon, req.years, req.freq, principal_at_maturity),
    }


YIELD_CURVE = [
    {"tenor_years": 0.25, "yield": 0.0415, "label": "3M"},
    {"tenor_years": 0.50, "yield": 0.0430, "label": "6M"},
    {"tenor_years": 1.00, "yield": 0.0455, "label": "1Y"},
    {"tenor_years": 2.00, "yield": 0.0480, "label": "2Y"},
    {"tenor_years": 3.00, "yield": 0.0505, "label": "3Y"},
    {"tenor_years": 5.00, "yield": 0.0535, "label": "5Y"},
    {"tenor_years": 7.00, "yield": 0.0555, "label": "7Y"},
    {"tenor_years": 10.00, "yield": 0.0570, "label": "10Y"},
    {"tenor_years": 20.00, "yield": 0.0595, "label": "20Y"},
    {"tenor_years": 30.00, "yield": 0.0605, "label": "30Y"},
]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health")
def root_health() -> dict:
    return {"status": "ok", "service": "NoorFinance API"}


@app.get("/")
def root() -> dict:
    return {"status": "ok", "service": "NoorFinance API"}


@app.post("/api/price/bond")
def price_bond(req: InstrumentRequest) -> dict:
    return value_instrument(req, principal_at_maturity=True, kind="conventional_bond")


@app.post("/api/price/sukuk")
def price_sukuk(req: InstrumentRequest) -> dict:
    """Ijara sukuk: periodic rental (like coupon) plus face value returned at maturity."""
    return {
        **value_instrument(req, principal_at_maturity=True, kind="ijara_sukuk"),
        "structure": {
            "type": "Ijara",
            "rental": "Periodic lease rental = face * rental_rate / freq",
            "maturity": "Underlying asset / face value paid at maturity",
            "note": "Priced as PV(rentals) + PV(face), identical closed form to a coupon bond.",
        },
    }


@app.post("/api/analytics/duration")
def analytics_duration(req: DurationRequest) -> dict:
    principal = True
    n = periods(req.years, req.freq)
    i = periodic_rate(req.yield_rate, req.freq)
    cfs = cashflows(req.face, req.coupon, n, req.freq, principal)
    price, priced = price_from_cashflows(cfs, i)
    mac = macaulay_duration(priced, price, req.freq)
    mod = modified_duration(mac, i, req.freq)
    conv = convexity(cfs, i, price, req.freq)
    dy = 0.0001
    i_up = periodic_rate(req.yield_rate + dy, req.freq)
    i_dn = periodic_rate(max(req.yield_rate - dy, 0.0), req.freq)
    p_up, _ = price_from_cashflows(cfs, i_up)
    p_dn, _ = price_from_cashflows(cfs, i_dn)
    return {
        "price": round(price, 8),
        "macaulay_duration": round(mac, 8),
        "modified_duration": round(mod, 8),
        "convexity": round(conv, 8),
        "dv01": round(mod * price / 10000.0, 8),
        "numerical_dv01": round((p_dn - p_up) / 2.0, 8),
        "duration_units": "years",
        "price_yield_curve": price_yield_curve(req.face, req.coupon, req.years, req.freq, principal),
        "interpretation": {
            "macaulay": "Weighted-average time to receive cash flows, in years.",
            "modified": "Approximate % price change for a 1.00 parallel yield move.",
            "convexity": "Second-order curvature of the price-yield relationship.",
        },
    }


@app.get("/api/yield-curve")
def yield_curve() -> dict:
    return {
        "currency": "USD",
        "as_of": "2026-10-03",
        "source": "illustrative par government curve",
        "points": YIELD_CURVE,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
