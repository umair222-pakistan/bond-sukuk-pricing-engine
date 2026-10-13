"""Vectorised pricing engine (V2).

Produces the same result structure as ``backend.main.value_instrument`` so the two
can be compared field by field. Strategy:

* the 81-point price/yield curve is always one matrix operation (81 x n);
* a single instrument with fewer than ``FAST_PATH_MAX_PERIODS`` periods is priced
  with plain Python floats (array set-up costs more than it saves at that size);
* longer instruments use numpy arrays throughout.

Cash flows are rounded to 8 decimals exactly as V1 does, so V1 and V2 prices agree
to floating-point precision.
"""
from __future__ import annotations

import statistics
import time
from typing import Any, Callable

import numpy as np

FAST_PATH_MAX_PERIODS = 100
CURVE_BPS = np.arange(0, 2001, 25)
CURVE_YIELDS = CURVE_BPS / 10000.0
THIRTY_360 = "30/360"
ACT_365 = "ACT/365"

FORMULAS = {
    "pv": "sum CF_t / (1+i)^t",
    "a_angle_n": "(1 - v^n) / i",
    "s_angle_n": "((1+i)^n - 1) / i",
    "duration": "sum t * PV(CF_t) / Price",
    "convexity": "sum t(t+1) CF_t / (1+i)^{t+2} / (Price * freq^2)",
}


def period_count(years: float, freq: int) -> int:
    return int(round(years * freq))


def _step(freq: int, day_count: str) -> float:
    """Year fraction of one period (30/360: 1/freq; ACT/365: days/365)."""
    if day_count == ACT_365:
        return int(365.0 / freq + 0.5) / 365.0
    return 1.0 / freq


def _payment(face: float, coupon: float, freq: int, day_count: str) -> float:
    """Periodic profit payment. 30/360 = face*coupon/freq; ACT/365 = face*coupon*days/365."""
    if day_count == ACT_365:
        days = int(365.0 / freq + 0.5)
        return face * coupon * days / 365.0
    return face * coupon / freq


def periodic_payment(face: float, coupon: float, freq: int, day_count: str = THIRTY_360) -> float:
    """Public accessor for the periodic profit / coupon payment."""
    return _payment(face, coupon, freq, day_count)


def cashflow_array(face: float, coupon: float, years: float, freq: int, day_count: str = THIRTY_360) -> np.ndarray:
    """Cash flows per period (profit + final principal), rounded to 8 decimals like V1."""
    n = period_count(years, freq)
    if n < 1:
        raise ValueError("Tenor must produce at least one period.")
    cf = np.full(n, _payment(face, coupon, freq, day_count))
    cf[-1] += face
    return np.round(cf, 8)


def prices_at_yields(cashflows: np.ndarray, freq: int, annual_yields: Any) -> np.ndarray:
    """Price the same cash flows at many annual yields in one (m x n) matrix product."""
    n = cashflows.shape[0]
    t = np.arange(1, n + 1, dtype=float)
    base = 1.0 + np.asarray(annual_yields, dtype=float) / freq
    discount = 1.0 / np.power(base[:, None], t[None, :])
    return discount @ cashflows


def _annuity(i: float, n: int) -> tuple[float, float, float]:
    """Return (a_angle_n, s_angle_n, v_n)."""
    v_n = 1.0 / ((1.0 + i) ** n)
    if abs(i) < 1e-12:
        return float(n), float(n), v_n
    return (1.0 - v_n) / i, (((1.0 + i) ** n) - 1.0) / i, v_n


def vectorized_price_curve(cashflows: np.ndarray, freq: int) -> list[dict]:
    """All 81 price/yield points in a single (81 x n) matrix product."""
    prices = prices_at_yields(cashflows, freq, CURVE_YIELDS).tolist()
    return [{"yield": round(y, 4), "price": round(p, 6)} for y, p in zip(CURVE_YIELDS.tolist(), prices)]


def _scalar_core(face: float, payment: float, i: float, n: int, step: float) -> dict:
    """Pure-Python pricing for short instruments."""
    base = 1.0 + i
    cfs: list[float] = []
    dfs: list[float] = []
    pvs: list[float] = []
    price = weighted = raw_conv = 0.0
    for t in range(1, n + 1):
        cf = round(payment + (face if t == n else 0.0), 8)
        df = 1.0 / (base ** t)
        pv = cf * df
        price += pv
        weighted += t * step * round(pv, 8)  # V1 weights with the rounded PV
        raw_conv += t * (t + 1) * cf / (base ** (t + 2))
        cfs.append(cf)
        dfs.append(df)
        pvs.append(pv)
    return {"cfs": cfs, "dfs": dfs, "pvs": pvs, "price": price, "weighted": weighted, "raw_conv": raw_conv}


def _numpy_core(face: float, payment: float, i: float, n: int, step: float) -> dict:
    """numpy pricing for long instruments."""
    base = 1.0 + i
    t = np.arange(1, n + 1, dtype=float)
    cf = np.full(n, payment)
    cf[-1] += face
    cf = np.round(cf, 8)
    df = 1.0 / np.power(base, t)
    pv = cf * df
    return {
        "cfs": cf.tolist(),
        "dfs": df.tolist(),
        "pvs": pv.tolist(),
        "price": float(pv.sum()),
        "weighted": float((t * step * np.round(pv, 8)).sum()),
        "raw_conv": float((t * (t + 1) * cf / np.power(base, t + 2)).sum()),
    }


def value_instrument_v2(
    face: float,
    coupon: float,
    yield_rate: float,
    years: float,
    freq: int,
    kind: str = "conventional_bond",
    day_count: str = THIRTY_360,
) -> dict:
    """Price an instrument. Same keys as V1 ``value_instrument`` plus ``engine`` metadata."""
    n = period_count(years, freq)
    if n < 1:
        raise ValueError("Tenor must produce at least one period.")
    i = yield_rate / freq
    payment = _payment(face, coupon, freq, day_count)
    step = _step(freq, day_count)
    path = "python" if n < FAST_PATH_MAX_PERIODS else "numpy"
    core = (_scalar_core if path == "python" else _numpy_core)(face, payment, i, n, step)

    price = core["price"]
    mac = core["weighted"] / price if price > 0 else 0.0
    mod = mac / (1.0 + i)
    conv = core["raw_conv"] / (price * freq ** 2) if price > 0 else 0.0
    annuity, accumulated, v_n = _annuity(i, n)
    pv_coupons = payment * annuity
    pv_principal = face * v_n

    cf_arr = np.asarray(core["cfs"], dtype=float)
    cashflows = []
    for idx in range(n):
        t = idx + 1
        principal = face if t == n else 0.0
        cashflows.append(
            {
                "period": t,
                "time_years": t * step if day_count == ACT_365 else t / freq,
                "coupon_or_rental": round(payment, 8),
                "principal": round(principal, 8),
                "cashflow": core["cfs"][idx],
                "df": round(core["dfs"][idx], 10),
                "pv": round(core["pvs"][idx], 8),
            }
        )

    out = {
        "instrument": kind,
        "inputs": {
            "face": face,
            "coupon": coupon,
            "yield": yield_rate,
            "years": years,
            "freq": freq,
            "periods": n,
            "periodic_yield": i,
            "day_count": day_count,
        },
        "formulas": dict(FORMULAS),
        "closed_form": {
            "periodic_payment": round(payment, 8),
            "a_angle_n": round(annuity, 10),
            "s_angle_n": round(accumulated, 10),
            "v_n": round(v_n, 10),
            "pv_coupons_or_rentals": round(pv_coupons, 8),
            "pv_principal": round(pv_principal, 8),
            "price": round(pv_coupons + pv_principal, 8),
        },
        "price": round(price, 8),
        "dirty_price": round(price, 8),
        "premium_discount": round(price - face, 8),
        "quote_vs_par": "premium" if price > face + 1e-8 else ("discount" if price < face - 1e-8 else "par"),
        "macaulay_duration": round(mac, 8),
        "modified_duration": round(mod, 8),
        "convexity": round(conv, 8),
        "dv01": round(mod * price / 10000.0, 8),
        "coupon_minus_yield": round(coupon - yield_rate, 8),
        "cashflows": cashflows,
        "price_yield_curve": vectorized_price_curve(cf_arr, freq),
        "engine": {"version": "v2", "path": path, "periods": n},
    }
    if kind == "ijara_sukuk":
        out["structure"] = {
            "type": "Ijara",
            "rental": "Periodic lease rental = face * rental_rate / freq",
            "maturity": "Underlying asset / face value paid at maturity",
            "note": "Priced as PV(rentals) + PV(face), identical closed form to a coupon bond.",
        }
    return out


def benchmark(fn: Callable[[], Any], repeats: int = 5, inner: int = 20) -> float:
    """Median wall time of ``fn`` in milliseconds (best-of-inner per repeat)."""
    samples = []
    for _ in range(repeats):
        start = time.perf_counter()
        for _ in range(inner):
            fn()
        samples.append((time.perf_counter() - start) / inner * 1000.0)
    return statistics.median(samples)
