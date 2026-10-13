"""Print V1 vs V2 timings: ``python -m backend.v2.profile_report``."""
from __future__ import annotations

import logging

from backend import main as v1

from . import engine

logger = logging.getLogger("noorfinance.v2")

CASES = [
    ("2y quarterly (8 periods)", 1000, 0.06, 0.05, 2, 4),
    ("10y semi-annual (20)", 1000, 0.06, 0.05, 10, 2),
    ("30y monthly (360)", 1000, 0.06, 0.05, 30, 12),
    ("50y monthly (600)", 1000, 0.06, 0.05, 50, 12),
]


def run() -> list[dict]:
    rows = []
    for label, face, cpn, yld, yrs, frq in CASES:
        req = v1.InstrumentRequest(face=face, coupon=cpn, **{"yield": yld}, years=yrs, freq=frq)
        v1_ms = engine.benchmark(lambda: v1.value_instrument(req, True, "conventional_bond"), 5, 20)
        v2_ms = engine.benchmark(lambda: engine.value_instrument_v2(face, cpn, yld, yrs, frq), 5, 20)
        n = engine.period_count(yrs, frq)
        curve_cfs = engine.np.full(n, face * cpn / frq)
        curve_cfs[-1] += face
        loop_ms = engine.benchmark(lambda: v1.price_yield_curve(face, cpn, yrs, frq, True), 5, 10)
        vec_ms = engine.benchmark(lambda: engine.vectorized_price_curve(curve_cfs, frq), 5, 10)
        row = {
            "case": label,
            "path": engine.value_instrument_v2(face, cpn, yld, yrs, frq)["engine"]["path"],
            "v1_ms": round(v1_ms, 4),
            "v2_ms": round(v2_ms, 4),
            "speedup": round(v1_ms / v2_ms, 2),
            "curve_loop_ms": round(loop_ms, 4),
            "curve_vec_ms": round(vec_ms, 4),
            "curve_speedup": round(loop_ms / vec_ms, 2),
        }
        logger.info("profile %s", row)
        rows.append(row)
    return rows


if __name__ == "__main__":
    print(f"{'case':28} {'path':7} {'V1 ms':>9} {'V2 ms':>9} {'x':>7} | {'curve loop':>10} {'curve vec':>10} {'x':>7}")
    for r in run():
        print(
            f"{r['case']:28} {r['path']:7} {r['v1_ms']:9.4f} {r['v2_ms']:9.4f} {r['speedup']:7.2f} | "
            f"{r['curve_loop_ms']:10.4f} {r['curve_vec_ms']:10.4f} {r['curve_speedup']:7.2f}"
        )
