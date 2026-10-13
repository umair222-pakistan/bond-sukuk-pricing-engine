"""Strict Pydantic V2 request schema and friendly error mapping for /api/v2."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_RATE = 0.30
MIN_FACE = 1.0
MAX_FACE = 1e12
MIN_YEARS = 0.01
MAX_YEARS = 50.0
MAX_FREQ = 12


class DayCount(str, Enum):
    THIRTY_360 = "30/360"
    ACT_365 = "ACT/365"


class AdvancedRequest(BaseModel):
    """Rates are explicit decimals (0.06 = 6%); no percent heuristics."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    face: float = Field(..., strict=True, allow_inf_nan=False, description="Face value, 1 to 1e12")
    coupon: float = Field(
        ...,
        strict=True,
        allow_inf_nan=False,
        validation_alias=AliasChoices("coupon", "profit_rate"),
        description="Annual profit / rental rate as decimal, 0 to 0.30",
    )
    yield_rate: float = Field(
        ...,
        strict=True,
        allow_inf_nan=False,
        alias="yield",
        description="Annual required yield as decimal, 0 to 0.30",
    )
    years: float = Field(..., strict=True, allow_inf_nan=False, description="Tenor in years, 0.01 to 50")
    freq: int = Field(2, strict=True, description="Payments per year, 1 to 12")
    structure: Literal["bond", "sukuk"] = "bond"
    day_count: DayCount = DayCount.THIRTY_360

    @field_validator("face")
    @classmethod
    def _face(cls, v: float) -> float:
        if v < MIN_FACE or v > MAX_FACE:
            raise ValueError("Face value must be between 1 and 1,000,000,000,000")
        return v

    @field_validator("coupon")
    @classmethod
    def _coupon(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Profit rate cannot be negative")
        if v > MAX_RATE:
            raise ValueError(f"Profit rate {v * 100:g}% exceeds AAOIFI 30% cap")
        return v

    @field_validator("yield_rate")
    @classmethod
    def _yield(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Yield cannot be negative")
        if v > MAX_RATE:
            raise ValueError(f"Yield {v * 100:g}% exceeds AAOIFI 30% cap")
        return v

    @field_validator("years")
    @classmethod
    def _years(cls, v: float) -> float:
        if v < MIN_YEARS or v > MAX_YEARS:
            raise ValueError("Tenor must be between 0.01 and 50 years")
        return v

    @field_validator("freq")
    @classmethod
    def _freq(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Payment frequency must be at least 1 per year")
        if v > MAX_FREQ:
            raise ValueError(f"Payment frequency {v} exceeds the supported maximum of {MAX_FREQ} per year")
        return v

    @model_validator(mode="after")
    def _has_period(self) -> "AdvancedRequest":
        if int(round(self.years * self.freq)) < 1:
            raise ValueError("Tenor is shorter than one payment period; increase the tenor or payment frequency")
        return self


_LABELS = {
    "face": "Face value",
    "coupon": "Profit rate",
    "profit_rate": "Profit rate",
    "yield": "Yield",
    "yield_rate": "Yield",
    "years": "Tenor",
    "freq": "Payment frequency",
    "structure": "Structure",
    "day_count": "Day-count convention",
    "type": "Structure type",
    "tenor": "Tenor",
    "asset_backed": "Asset-backed flag",
    "underlying_asset": "Underlying asset",
    "principal_guaranteed": "Principal-guaranteed flag",
    "redemption_year": "Redemption year",
    "yield_bump_bps": "Yield bump (bps)",
    "purchase_price_pct": "Asset purchase price (% of face)",
    "after_years": "Step-up year",
    "step_up_bps": "Step-up (bps)",
    "call_year": "Call year",
    "call_price_pct": "Call price (% of face)",
    "max_bump_bps": "Maximum bump (bps)",
    "step_bps": "Bump step (bps)",
    "points": "Curve points",
    "scenarios": "Scenarios",
}


def friendly_message(error: dict[str, Any]) -> str:
    """Translate one Pydantic error dict into an Islamic-finance friendly sentence."""
    loc = [str(p) for p in error.get("loc", ()) if p != "body"]
    field = loc[-1] if loc else ""
    label = _LABELS.get(field, field or "Request")
    kind = error.get("type", "")
    msg = str(error.get("msg", "Invalid value"))
    if kind == "value_error":
        return msg.removeprefix("Value error, ")
    if kind == "missing":
        return f"{label} is required"
    if kind == "extra_forbidden":
        return f"Unknown field '{field}' is not accepted"
    if kind in ("float_type", "int_type", "float_parsing", "int_parsing"):
        return f"{label} must be a number (decimals for rates, e.g. 0.06 for 6%)"
    if kind == "enum":
        return f"{label} must be one of: 30/360, ACT/365"
    if kind == "literal_error":
        return f"{label} must be one of: bond, sukuk"
    return f"{label}: {msg}"


def friendly_errors(errors: list[dict[str, Any]]) -> list[str]:
    return [friendly_message(e) for e in errors]
