"""Heuristic AAOIFI-oriented structure checker. Not a fatwa; for Shariah Board review."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

DISCLAIMER = "Heuristic score, for Shariah Board review, not a fatwa. Based on AAOIFI SS 17 and FAS 33."

SUKUK_TYPES = ("ijara", "murabaha", "musharaka", "mudaraba", "wakala", "istisna", "salam", "diminishing_musharaka")
RECEIVABLE_TYPES = ("murabaha", "istisna", "salam")

PROFIT_CAP = 0.30
TENOR_CAP_YEARS = 50.0
TENOR_PREFERRED_YEARS = 10.0

POINTS = {
    "structure_type": 20,
    "asset_backed": 25,
    "underlying_asset": 15,
    "profit_rate_cap": 15,
    "tenor_cap": 5,
    "tenor_preferred": 10,
    "capital_not_guaranteed": 10,
}

SS17 = "AAOIFI SS 17 (Investment Sukuk)"
POLICY = "NoorFinance policy threshold (not an AAOIFI numeric limit)"


def normalise_type(value: str) -> str:
    return str(value).strip().lower().replace("-", "_").replace(" ", "_")


def _check(rule: str, ok: bool, note: str, reference: str) -> dict:
    return {"rule": rule, "pass": bool(ok), "points": POINTS[rule] if ok else 0,
            "max_points": POINTS[rule], "note": note, "reference": reference}


def evaluate(
    structure_type: str,
    underlying_asset: Optional[str],
    tenor: float,
    profit_rate: float,
    asset_backed: bool,
    principal_guaranteed: bool = False,
) -> dict:
    kind = normalise_type(structure_type)
    recognised = kind in SUKUK_TYPES
    if not kind:
        type_note = "No sukuk structure declared; the structure (e.g. ijara) must be identified"
    elif recognised and kind in RECEIVABLE_TYPES:
        type_note = (f"'{kind}' is a recognised structure; receivable-based sukuk have secondary-market "
                     "trading restrictions the Shariah Board must confirm")
    elif recognised:
        type_note = f"'{kind}' is a recognised sukuk structure"
    else:
        type_note = (f"'{structure_type}' is not a recognised sukuk structure (ijara, murabaha, musharaka, "
                     "mudaraba, wakala, istisna, salam); interest-bearing debt fails this check")
    has_asset = bool(underlying_asset and underlying_asset.strip())
    checks = [
        _check("structure_type", recognised, type_note, SS17),
        _check("asset_backed", asset_backed,
               "Sukuk represent ownership in identifiable assets" if asset_backed
               else "No asset-backing declared; sukuk must evidence ownership of assets, usufruct or a venture", SS17),
        _check("underlying_asset", has_asset,
               f"Underlying asset declared: {underlying_asset.strip()}" if has_asset
               else "No underlying asset described; identify the asset or venture", SS17),
        _check("profit_rate_cap", 0 <= profit_rate <= PROFIT_CAP,
               f"Profit rate {profit_rate * 100:g}% is within the 30% cap" if 0 <= profit_rate <= PROFIT_CAP
               else f"Profit rate {profit_rate * 100:g}% exceeds the 30% cap", POLICY),
        _check("tenor_cap", 0 < tenor <= TENOR_CAP_YEARS,
               f"Tenor {tenor:g}y is within the {TENOR_CAP_YEARS:g}y cap" if 0 < tenor <= TENOR_CAP_YEARS
               else f"Tenor {tenor:g}y is outside the supported 0-{TENOR_CAP_YEARS:g}y range", POLICY),
        _check("tenor_preferred", 0 < tenor <= TENOR_PREFERRED_YEARS,
               "Tenor of 10 years or less (bonus)" if 0 < tenor <= TENOR_PREFERRED_YEARS
               else "Tenor above 10 years: no bonus; long-dated terms need closer review", POLICY),
        _check("capital_not_guaranteed", not principal_guaranteed,
               "No capital guarantee declared" if not principal_guaranteed
               else "A guaranteed principal resembles a debt claim; review the purchase undertaking terms", SS17),
    ]
    score = sum(c["points"] for c in checks)
    rating = ("High indication of compliance" if score >= 80
              else "Moderate: Shariah Board review required" if score >= 50
              else "Low: structure likely non-compliant")
    return {"score": score, "rating": rating, "checks": checks, "disclaimer": DISCLAIMER}


class ComplianceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    structure_type: str = Field(..., strict=True, alias="type", min_length=1, max_length=60)
    underlying_asset: Optional[str] = Field(None, strict=True, max_length=200)
    tenor: float = Field(..., strict=True, allow_inf_nan=False)
    profit_rate: float = Field(..., strict=True, allow_inf_nan=False)
    asset_backed: bool = Field(False, strict=True)
    principal_guaranteed: bool = Field(False, strict=True)

    @field_validator("tenor")
    @classmethod
    def _tenor(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Tenor must be greater than zero")
        return v

    @field_validator("profit_rate")
    @classmethod
    def _rate(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Profit rate cannot be negative")
        return v


def check(req: ComplianceRequest) -> dict[str, Any]:
    return evaluate(req.structure_type, req.underlying_asset, req.tenor, req.profit_rate,
                    req.asset_backed, req.principal_guaranteed)
