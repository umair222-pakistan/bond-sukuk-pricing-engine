"""NoorFinance golden tests.

Locks the behaviour of the V1 pricing engine (backend/main.py) so that later
phases can add V2 layers without changing any existing calculation.

Run with either:
    python verify.py
    python -m pytest verify.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# The suite shares one client IP; keep the in-memory limiter from tripping on its own traffic.
# (429 behaviour is tested separately against a dedicated app with a tiny limit.)
os.environ.setdefault("RATE_LIMIT", "5000/minute")
os.environ.setdefault("RATE_LIMIT_HEALTH", "5000/minute")
os.environ.setdefault("RATE_LIMIT_AUTH", "5000/minute")
# Demo JWT secret for the auth tests (overrides any placeholder in the shell; never used in production).
os.environ.setdefault("JWT_SECRET", "demo-test-secret-key-32-chars-long-123456")
from fastapi import HTTPException  # noqa: E402

from backend import main as v1  # noqa: E402

TOL = 1e-6


def _req(face=1000.0, coupon=0.06, yld=0.05, years=10.0, freq=2):
    return v1.InstrumentRequest(face=face, coupon=coupon, **{"yield": yld}, years=years, freq=freq)


def _reference_price(face, coupon, yld, years, freq):
    """Independent textbook implementation used as the oracle."""
    n = int(round(years * freq))
    i = yld / freq
    c = face * coupon / freq
    return sum((c + (face if t == n else 0.0)) / (1 + i) ** t for t in range(1, n + 1))


def _client():
    try:
        from fastapi.testclient import TestClient

        return TestClient(v1.app)
    except Exception:  # httpx missing: HTTP-level tests are skipped
        return None


# --------------------------------------------------------------------------
# Golden values: V1 pricing
# --------------------------------------------------------------------------
def test_golden_premium_bond_price():
    out = v1.value_instrument(_req(), True, "conventional_bond")
    assert abs(out["price"] - _reference_price(1000, 0.06, 0.05, 10, 2)) < TOL
    assert abs(out["price"] - 1077.94554) < 1e-3
    assert out["quote_vs_par"] == "premium"
    assert abs(out["premium_discount"] - (out["price"] - 1000)) < TOL


def test_golden_par_and_discount():
    par = v1.value_instrument(_req(coupon=0.05, yld=0.05), True, "conventional_bond")
    assert abs(par["price"] - 1000.0) < TOL and par["quote_vs_par"] == "par"
    disc = v1.value_instrument(_req(coupon=0.04, yld=0.06), True, "conventional_bond")
    assert disc["price"] < 1000 and disc["quote_vs_par"] == "discount"


def test_golden_zero_yield():
    out = v1.value_instrument(_req(coupon=0.06, yld=0.0, years=5, freq=2), True, "conventional_bond")
    assert abs(out["price"] - 1300.0) < TOL  # 1000 + 10 * 30
    assert out["closed_form"]["a_angle_n"] == 10.0


def test_golden_single_period():
    out = v1.value_instrument(_req(years=0.5, freq=2), True, "conventional_bond")
    assert out["inputs"]["periods"] == 1
    assert abs(out["price"] - 1030.0 / 1.025) < TOL


def test_closed_form_matches_cashflow_price():
    for args in [(1000, 0.06, 0.05, 10, 2), (500, 0.08, 0.03, 7, 4), (250, 0.0, 0.04, 3, 1), (1e6, 0.045, 0.07, 30, 12)]:
        out = v1.value_instrument(_req(*args), True, "conventional_bond")
        assert abs(out["price"] - out["closed_form"]["price"]) < 1e-5
        assert abs(out["price"] - _reference_price(*args)) < 1e-5


def test_annuity_identities():
    i, n = 0.025, 20
    assert abs(v1.a_angle_n(i, n) - (1 - (1 + i) ** -n) / i) < 1e-12
    assert abs(v1.s_angle_n(i, n) - ((1 + i) ** n - 1) / i) < 1e-12
    assert abs(v1.s_angle_n(i, n) - v1.a_angle_n(i, n) * (1 + i) ** n) < 1e-9
    assert v1.a_angle_n(0.0, 7) == 7.0 and v1.s_angle_n(0.0, 7) == 7.0


def test_cashflow_schedule():
    rows = v1.cashflows(1000, 0.06, 4, 2, True)
    assert [r["period"] for r in rows] == [1, 2, 3, 4]
    assert all(abs(r["coupon_or_rental"] - 30.0) < TOL for r in rows)
    assert rows[-1]["principal"] == 1000.0 and rows[0]["principal"] == 0.0
    assert abs(rows[-1]["cashflow"] - 1030.0) < TOL
    assert abs(rows[1]["time_years"] - 1.0) < TOL


def test_duration_convexity_dv01():
    out = v1.value_instrument(_req(), True, "conventional_bond")
    mac, mod = out["macaulay_duration"], out["modified_duration"]
    assert 0 < mod < mac < 10
    assert abs(mod - mac / 1.025) < 1e-6
    assert abs(out["dv01"] - mod * out["price"] / 10000) < 1e-6
    assert out["convexity"] > 0
    zc = v1.value_instrument(_req(coupon=0.0, years=5), True, "conventional_bond")
    assert abs(zc["macaulay_duration"] - 5.0) < 1e-6  # zero-coupon: Macaulay == maturity


def test_price_yield_curve_shape():
    out = v1.value_instrument(_req(), True, "conventional_bond")
    curve = out["price_yield_curve"]
    assert len(curve) == 81
    assert curve[0]["yield"] == 0.0 and curve[-1]["yield"] == 0.2
    assert abs(curve[0]["price"] - 1600.0) < 1e-3  # 20 * 30 + 1000
    prices = [p["price"] for p in curve]
    assert all(a > b for a, b in zip(prices, prices[1:]))


def test_numeric_dv01_matches_analytic():
    out = v1.analytics_duration(v1.DurationRequest(face=1000, coupon=0.06, **{"yield": 0.05}, years=10, freq=2))
    assert abs(out["numerical_dv01"] - out["dv01"]) / out["dv01"] < 0.01
    assert out["duration_units"] == "years"


def test_percent_inputs_are_normalised():
    a = _req(coupon=6, yld=5)
    assert abs(a.coupon - 0.06) < 1e-12 and abs(a.yield_rate - 0.05) < 1e-12


def test_input_validation_v1():
    for bad in [dict(face=0), dict(face=-5), dict(years=0), dict(freq=0), dict(freq=13), dict(coupon=-0.01)]:
        try:
            _req(**bad)
        except Exception:
            continue
        raise AssertionError(f"expected validation failure for {bad}")
    try:
        v1.periods(0.1, 2)
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("tenor below one period must raise")


def test_tenor_rounding_is_locked():
    # Documented fragility: 2.3y * freq 2 = 4.6 -> 5 periods (silent rounding).
    assert v1.periods(2.3, 2) == 5


def test_yield_curve_static_payload():
    data = v1.yield_curve()
    assert len(data["points"]) == 10 and data["points"][0]["label"] == "3M"
    assert data["points"][-1]["label"] == "30Y"


def test_http_endpoints_contract():
    client = _client()
    if client is None:
        return
    body = {"face": 1000, "coupon": 0.06, "yield": 0.05, "years": 10, "freq": 2}
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/health").json()["service"] == "NoorFinance API"
    assert client.get("/").json()["status"] == "ok"
    bond = client.post("/api/price/bond", json=body).json()
    assert bond["instrument"] == "conventional_bond" and abs(bond["price"] - 1077.94554) < 1e-3
    sukuk = client.post("/api/price/sukuk", json=body).json()
    assert sukuk["instrument"] == "ijara_sukuk" and sukuk["structure"]["type"] == "Ijara"
    assert abs(sukuk["price"] - bond["price"]) < TOL
    dur = client.post("/api/analytics/duration", json=body).json()
    assert {"macaulay_duration", "modified_duration", "convexity", "dv01", "numerical_dv01"} <= set(dur)
    assert len(client.get("/api/yield-curve").json()["points"]) == 10
    assert client.post("/api/price/bond", json={**body, "face": -1}).status_code == 422
    assert client.post("/api/price/bond", json={**body, "years": 0.1}).status_code == 400


# --------------------------------------------------------------------------
# Phase 1: V2 efficiency engine
# --------------------------------------------------------------------------
def test_v2_matches_v1_within_1e6():
    from backend.v2 import engine

    for args in [(1000, 0.06, 0.05, 10, 2), (500, 0.08, 0.03, 7, 4), (250, 0.0, 0.04, 3, 1),
                 (1e6, 0.045, 0.07, 30, 12), (1000, 0.05, 0.0, 5, 2)]:
        face, cpn, yld, yrs, frq = args
        old = v1.value_instrument(_req(*args), True, "conventional_bond")
        new = engine.value_instrument_v2(face, cpn, yld, yrs, frq)
        for key in ("price", "macaulay_duration", "modified_duration", "convexity", "dv01"):
            assert abs(old[key] - new[key]) < TOL, (args, key, old[key], new[key])
        expected_path = "python" if new["inputs"]["periods"] < engine.FAST_PATH_MAX_PERIODS else "numpy"
        assert new["engine"]["path"] == expected_path
    # numpy path (>= 100 periods) must match too
    old = v1.value_instrument(_req(1000, 0.06, 0.05, 40, 12), True, "conventional_bond")
    new = engine.value_instrument_v2(1000, 0.06, 0.05, 40, 12)
    assert new["engine"]["path"] == "numpy" and abs(old["price"] - new["price"]) < TOL
    assert abs(old["convexity"] - new["convexity"]) < TOL
    # HTTP: strict decimals, friendly errors, parity block
    client = _client()
    if client is not None:
        body = {"face": 1000, "coupon": 0.06, "yield": 0.05, "years": 10, "freq": 2, "structure": "sukuk"}
        res = client.post("/api/v2/calculate/advanced", json=body).json()
        assert res["parity_ok"] is True and abs(res["v1_price"] - res["v2_price"]) < TOL
        assert res["result"]["instrument"] == "ijara_sukuk"
        bad = client.post("/api/v2/calculate/advanced", json={**body, "coupon": 0.35})
        assert bad.status_code == 400 and bad.json()["message"] == "Profit rate 35% exceeds AAOIFI 30% cap"
        act = client.post("/api/v2/calculate/advanced", json={**body, "day_count": "ACT/365"}).json()
        assert act["result"]["inputs"]["day_count"] == "ACT/365" and act["parity_ok"] is None
        assert client.post("/api/v2/calculate/advanced", json={**body, "freq": 13}).status_code == 400
        assert client.post("/api/v2/calculate/advanced", json={**body, "years": 60}).status_code == 400
        assert client.post("/api/v2/calculate/advanced", json={**body, "face": "1000"}).status_code == 400
        assert client.post("/api/v2/calculate/advanced", content=b"not json").status_code == 400


def test_v2_cache_hit():
    from backend.v2.cache import LRUCache, make_key
    from backend.v2.router import cache, compute_advanced
    from backend.v2.schemas import AdvancedRequest

    assert make_key({"face": 1000, "coupon": 0.06, "yield": 0.05, "years": 10, "freq": 2}) == make_key(
        {"freq": 2.0, "years": 10, "yield": 0.05, "coupon": 0.06, "face": 1000.0})
    small = LRUCache(2)
    small.set("a", 1); small.set("b", 2); small.get("a"); small.set("c", 3)
    assert small.get("b") is None and small.get("a") == 1 and len(small) == 2  # LRU eviction
    assert LRUCache().maxsize == 512

    cache.clear()
    req = AdvancedRequest.model_validate({"face": 1234.5, "coupon": 0.071, "yield": 0.049, "years": 6, "freq": 4})
    first, prof1, hit1 = compute_advanced(req)
    second, prof2, hit2 = compute_advanced(req)
    assert hit1 is False and hit2 is True
    assert prof1["cache_hit"] is False and prof2["cache_hit"] is True
    assert first["v2_price"] == second["v2_price"] and prof1["cache_key"] == prof2["cache_key"]
    assert prof2["v2_time_ms"] < prof1["v2_time_ms"] * 5 + 1


def test_v2_vectorized_curve_matches_loop_curve():
    import numpy as np

    from backend.v2 import engine

    for face, cpn, yrs, frq in [(1000, 0.06, 10, 2), (100, 0.0, 5, 1), (5000, 0.09, 30, 12), (1000, 0.04, 0.5, 2)]:
        loop = v1.price_yield_curve(face, cpn, yrs, frq, True)
        n = engine.period_count(yrs, frq)
        cfs = np.full(n, round(face * cpn / frq, 8))
        cfs[-1] += face
        vec = engine.vectorized_price_curve(np.round(cfs, 8), frq)
        assert len(vec) == len(loop) == 81
        for a, b in zip(loop, vec):
            assert a["yield"] == b["yield"] and abs(a["price"] - b["price"]) < TOL


# --------------------------------------------------------------------------
# Phase 2: market differentiators (all via TestClient against /api/v2)
# --------------------------------------------------------------------------
_BASE = {"face": 1000, "coupon": 0.06, "yield": 0.05, "years": 10, "freq": 2}


def _post(path, body=None, **kw):
    client = _client()
    assert client is not None, "httpx is required for Phase 2 tests (pip install httpx)"
    return client.post(path, json=body, **kw) if body is not None else client.post(path, **kw)


def test_v2_sensitivity():
    res = _post("/api/v2/sensitivity", _BASE)
    assert res.status_code == 200
    out = res.json()
    table = out["table"]
    assert out["table_points"] == len(table) == 25
    assert table[0]["bump_bps"] == -300 and table[-1]["bump_bps"] == 300 and table[12]["bump_bps"] == 0
    base = v1.value_instrument(_req(), True, "conventional_bond")
    assert abs(out["base"]["price"] - base["price"]) < TOL
    assert abs(table[12]["price"] - base["price"]) < 1e-5
    prices = [r["price"] for r in table]
    assert all(a > b for a, b in zip(prices, prices[1:]))
    for row in (table[0], table[6], table[18], table[24]):  # independent repricing
        assert abs(row["price"] - _reference_price(1000, 0.06, row["yield"], 10, 2)) < 1e-5, row
    assert out["dv01"]["parity_ok"] is True and out["dv01"]["rel_diff"] < 1e-4
    assert abs(table[0]["approximation_error"]) < 15  # duration+convexity approximation is close
    assert _post("/api/v2/sensitivity", {**_BASE, "coupon": 0.4}).status_code == 400
    assert _post("/api/v2/sensitivity", {**_BASE, "max_bump_bps": 100, "step_bps": 30}).status_code == 400


def test_v2_compare():
    body = {"bond": _BASE, "sukuk": {"face": 1000, "profit_rate": 0.06, "years": 10, "freq": 2,
                                     "structure": "ijara", "underlying_asset": "Office building"}}
    res = _post("/api/v2/compare", body)
    assert res.status_code == 200
    out = res.json()
    assert out["sukuk"]["pricing"]["label"] == "profit" and out["sukuk"]["pricing"]["profit_rate"] == 0.06
    assert abs(out["bond"]["pricing"]["price"] - out["sukuk"]["pricing"]["price"]) < TOL  # same math
    assert out["difference"]["sukuk_minus_bond"]["price"] == 0
    assert out["compliance_score"] == 100 and out["bond"]["compliance_score"] < 50
    assert out["disclaimer"] == ("Heuristic score, for Shariah Board review, not a fatwa. "
                                 "Based on AAOIFI SS 17 and FAS 33.")
    assert out["audit"]["id"] and len(out["audit"]["input_hash"]) == 64
    weak = {**body, "sukuk": {**body["sukuk"], "years": 20, "asset_backed": False, "underlying_asset": ""}}
    assert _post("/api/v2/compare", weak).json()["compliance_score"] < out["compliance_score"]
    no_struct = {"bond": _BASE, "sukuk": {"face": 1000, "profit_rate": 0.06, "years": 10, "freq": 2}}
    assert _post("/api/v2/compare", no_struct).status_code == 400
    high = {**body, "sukuk": {**body["sukuk"], "profit_rate": 0.35}}
    assert "exceeds AAOIFI 30% cap" in _post("/api/v2/compare", high).json()["message"]


def test_v2_batch():
    import io

    rows = [{**_BASE, "kind": "bond"}, {**_BASE, "kind": "sukuk", "years": 5},
            {"face": 500, "coupon": 0.5, "yield": 0.05, "years": 3, "freq": 2, "kind": "bond"}]
    out = _post("/api/v2/batch", rows).json()
    assert out["summary"]["priced"] == 2 and out["summary"]["failed"] == 1
    assert "exceeds AAOIFI 30% cap" in out["errors"][0]["error"] and out["errors"][0]["index"] == 2
    assert abs(out["results"][0]["price"] - _reference_price(1000, 0.06, 0.05, 10, 2)) < 1e-5
    s = out["summary"]
    assert abs(s["total_market_value"] - sum(r["price"] for r in out["results"])) < 1e-6
    assert abs(s["weighted_avg_yield_by_face"] - 0.05) < 1e-9
    assert _post("/api/v2/batch", rows[:1]).json()["results"][0]["cache_hit"] is True  # LRU cache
    big = [dict(_BASE, face=1000 + i) for i in range(101)]
    assert _post("/api/v2/batch", big).status_code == 400
    assert _post("/api/v2/batch", big[:100]).json()["summary"]["priced"] == 100
    csv_text = "face,coupon,yield,years,freq,kind\n1000,0.06,0.05,10,2,bond\n2000,0.04,0.05,5,2,sukuk\n"
    csv_res = _post("/api/v2/batch", files={"file": ("p.csv", csv_text.encode(), "text/csv")})
    assert csv_res.status_code == 200 and csv_res.json()["summary"]["priced"] == 2
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["face", "coupon", "yield", "years", "freq", "kind"])
    ws.append([1000, 0.06, 0.05, 10, 2, "bond"])
    ws.append([1500, 0.05, 0.05, 4, 4, "sukuk"])
    buf = io.BytesIO()
    wb.save(buf)
    xl = _post("/api/v2/batch", files={"file": ("p.xlsx", buf.getvalue(), "application/octet-stream")})
    assert xl.status_code == 200 and xl.json()["summary"]["priced"] == 2
    assert abs(xl.json()["results"][1]["price"] - 1500.0) < 1e-6  # coupon == yield -> par
    bad = _post("/api/v2/batch", files={"file": ("bad.xlsx", b"junk", "application/octet-stream")})
    assert bad.status_code == 400


def test_v2_scenarios():
    sc = [{"type": "early_redemption", "redemption_year": 5, "yield_bump_bps": 0},
          {"type": "step_up", "after_years": 5, "step_up_bps": 100},
          {"type": "callable", "call_year": 5, "call_price_pct": 100},
          {"type": "step_up", "after_years": 5, "step_up_bps": 3000}]
    out = _post("/api/v2/scenarios", {**_BASE, "scenarios": sc}).json()
    base = out["base_price"]
    assert abs(base - 1077.94554) < 1e-3 and len(out["scenarios"]) == 3 and len(out["errors"]) == 1
    early, step, call = out["scenarios"]
    assert abs(early["scenario_price"] - _reference_price(1000, 0.06, 0.05, 5, 2)) < 1e-5
    assert abs(call["scenario_price"] - early["scenario_price"]) < 1e-9 and call["price_to_worst"] < base
    expected = (sum(30 / 1.025 ** t for t in range(1, 11)) + sum(35 / 1.025 ** t for t in range(11, 21))
                + 1000 / 1.025 ** 20)
    assert step["scenario_price"] > base and abs(step["scenario_price"] - expected) < 1e-5
    assert "exceeds AAOIFI 30% cap" in out["errors"][0]["error"] and early["impact_pct"] < 0
    bump = {"type": "early_redemption", "redemption_year": 5, "yield_bump_bps": 100}
    bumped = _post("/api/v2/scenarios", {**_BASE, "scenarios": [bump]}).json()
    assert bumped["scenarios"][0]["scenario_price"] < early["scenario_price"]
    assert _post("/api/v2/scenarios", {**_BASE, "scenarios": []}).status_code == 400
    late = _post("/api/v2/scenarios", {**_BASE, "scenarios": [{"type": "callable", "call_year": 10}]}).json()
    assert late["errors"] and not late["scenarios"]


def test_v2_yield_curve_bootstrap():
    pts = [{"years": 1, "yield": 0.04}, {"years": 2, "yield": 0.045}, {"years": 5, "yield": 0.05}]
    body = {"points": pts, "freq": 1, "price": {"face": 100, "coupon": 0.05, "years": 5, "freq": 1}}
    out = _post("/api/v2/yield-curve/bootstrap", body).json()
    zc = out["zero_curve"]
    assert len(zc) == 5 and abs(zc[0]["zero_rate"] - 0.04) < 1e-9  # 1y zero == 1y par
    assert abs(zc[0]["discount_factor"] - 1 / 1.04) < 1e-8
    assert abs(zc[1]["par_yield"] - 0.045) < 1e-12 and abs(zc[4]["par_yield"] - 0.05) < 1e-12
    assert all(z["zero_rate"] >= z["par_yield"] - 1e-9 for z in zc[1:])  # upward curve: zero >= par
    assert abs(out["pricing"]["price"] - 100.0) < 1e-6  # par bond on its own curve prices at par
    assert _post("/api/v2/yield-curve/bootstrap", {"points": pts[:1]}).status_code == 400
    dup = {"points": [pts[0], {"years": 1, "yield": 0.05}]}
    assert _post("/api/v2/yield-curve/bootstrap", dup).status_code == 400
    high = {"points": [pts[0], {"years": 2, "yield": 0.5}]}
    assert _post("/api/v2/yield-curve/bootstrap", high).status_code == 400


def test_v2_compliance_check():
    good = {"type": "ijara", "underlying_asset": "Office building", "tenor": 5, "profit_rate": 0.06,
            "asset_backed": True}
    out = _post("/api/v2/compliance/check", good).json()
    assert out["score"] == 100 and all(c["pass"] for c in out["checks"])
    assert {"rule", "pass", "note"} <= set(out["checks"][0])
    assert "not a fatwa" in out["disclaimer"] and "SS 17" in out["disclaimer"]
    bad = _post("/api/v2/compliance/check", {"type": "conventional loan", "tenor": 40, "profit_rate": 0.35,
                                              "asset_backed": False}).json()
    failed = {c["rule"] for c in bad["checks"] if not c["pass"]}
    assert {"structure_type", "asset_backed", "underlying_asset", "profit_rate_cap", "tenor_preferred"} <= failed
    assert bad["score"] < 30
    assert _post("/api/v2/compliance/check", {**good, "tenor": 20}).json()["score"] == 90  # loses 10y bonus
    assert _post("/api/v2/compliance/check", {**good, "tenor": -1}).status_code == 400
    assert _post("/api/v2/compliance/check", {"type": "ijara"}).status_code == 400


def test_v2_audit_trail():
    import uuid

    from backend.v2 import audit

    out = _post("/api/v2/calculate/advanced", _BASE).json()
    rec_id = out["audit"]["id"]
    got = _client().get(f"/api/v2/audit/{rec_id}")
    assert got.status_code == 200
    rec = got.json()
    assert str(uuid.UUID(rec["id"])) == rec_id and len(rec["input_hash"]) == 64
    assert rec["timestamp"].endswith("+00:00") and rec["engine"]["name"] == "noorfinance-v2"
    assert abs(rec["price"] - out["v2_price"]) < 1e-9
    assert rec["input_hash"] == audit.input_hash(rec["inputs"])  # tamper check
    assert _client().get("/api/v2/audit/does-not-exist").status_code == 404
    exp = _post("/api/v2/audit/export", {"ids": [rec_id, "missing-id"]}).json()
    assert exp["count"] == 1 and exp["missing_ids"] == ["missing-id"] and exp["records"][0]["id"] == rec_id
    assert len(exp["integrity_sha256"]) == 64
    full = _post("/api/v2/audit/export").json()
    assert full["count"] >= 1 and full["export_type"] == "noorfinance.audit_trail"
    small = audit.AuditStore(3)
    for i in range(5):
        small.add({"id": str(i)})
    assert len(small) == 3 and small.get("0") is None and audit.MAX_RECORDS == 1000
    assert _post("/api/v2/audit/export", {"ids": "nope"}).status_code == 400


# --------------------------------------------------------------------------
# Phase 3: security, health, sensitivity contract, request tracing
# --------------------------------------------------------------------------
def test_rate_limit_header_present():
    res = _post("/api/v2/sensitivity", _BASE)
    assert res.status_code == 200
    limit = res.headers.get("x-ratelimit-limit")
    assert limit is not None and int(limit) > 0
    assert res.headers.get("x-ratelimit-remaining") is not None
    assert res.headers.get("x-ratelimit-reset") is not None


def test_auth_token_returns_jwt():
    import jwt

    client = _client()
    res = client.post("/api/v2/auth/token", json={"username": "demo.user", "role": "analyst"})
    assert res.status_code == 200
    out = res.json()
    assert out["token_type"] == "bearer" and out["expires_in"] > 0
    claims = jwt.decode(out["access_token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert claims["sub"] == "demo.user" and claims["role"] == "analyst"
    me = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {out['access_token']}"})
    assert me.status_code == 200 and me.json()["username"] == "demo.user"
    assert client.get("/api/v2/auth/me").status_code == 401  # no token, no identity


def test_health_has_v2_status():
    out = _client().get("/api/health").json()
    assert out["status"] == "ok" and out["v2_status"] == "ok"
    assert out["version"] == "2.0.0" and isinstance(out["cache_size"], int)


def test_sensitivity_returns_list():
    res = _post("/api/v2/sensitivity", _BASE)
    out = res.json()
    assert isinstance(out["table"], list) and len(out["table"]) == 25
    assert all({"bump_bps", "yield", "price"} <= set(row) for row in out["table"])
    assert res.headers["x-audit-id"] == out["audit"]["id"]  # audit ID also sent as a header


def test_request_id_header():
    import uuid

    client = _client()
    rid = str(uuid.uuid4())
    assert client.get("/api/health", headers={"X-Request-ID": rid}).headers["x-request-id"] == rid
    generated = client.get("/api/health").headers["x-request-id"]
    assert str(uuid.UUID(generated)) == generated
    replaced = client.get("/api/health", headers={"X-Request-ID": "not-a-valid-id"}).headers["x-request-id"]
    assert replaced != "not-a-valid-id" and str(uuid.UUID(replaced)) == replaced


def _run() -> int:
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as exc:  # report every failure, never crash the runner
            failed += 1
            print(f"FAIL  {name}: {exc!r}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
