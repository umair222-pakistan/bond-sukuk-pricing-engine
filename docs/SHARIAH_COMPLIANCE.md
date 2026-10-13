# Shariah Compliance Checks (AAOIFI SS 17)

NoorFinance's `POST /api/v2/compliance/check` and the `compliance` block returned by `POST /api/v2/compare` score a sukuk structure against seven checks drawn from **AAOIFI Shari'ah Standard No. 17 (Investment Sukuk)**, with NoorFinance policy thresholds where AAOIFI gives no numeric limit.

> **Disclaimer.** The score is a heuristic for screening and for Shari'ah Board review. It is not a fatwa and does not certify compliance. The response carries this disclaimer: *"Heuristic score, for Shariah Board review, not a fatwa. Based on AAOIFI SS 17 and FAS 33."*

## The seven checks

Each check is worth a fixed number of points. The points sum to a score out of 100. The implementation lives in `backend/v2/compliance.py`.

| # | Rule (`rule`) | Points | Passes when | Reference |
|---|---|---|---|---|
| 1 | `structure_type` | 20 | The structure is a recognised sukuk type: ijara, murabaha, musharaka, mudaraba, wakala, istisna, salam or diminishing musharaka. Interest-bearing debt fails. | AAOIFI SS 17 |
| 2 | `asset_backed` | 25 | The sukuk declares asset backing, that is ownership of identifiable assets, usufruct or a venture. | AAOIFI SS 17 |
| 3 | `underlying_asset` | 15 | A non-empty underlying asset or venture is described. | AAOIFI SS 17 |
| 4 | `profit_rate_cap` | 15 | The profit rate is between 0% and 30%. | NoorFinance policy threshold (not an AAOIFI numeric limit) |
| 5 | `tenor_cap` | 5 | The tenor is greater than 0 and no more than 50 years. | NoorFinance policy threshold |
| 6 | `tenor_preferred` | 10 | The tenor is 10 years or less (a bonus). | NoorFinance policy threshold |
| 7 | `capital_not_guaranteed` | 10 | The principal is not guaranteed. A guaranteed principal resembles a debt claim. | AAOIFI SS 17 |

The maximum score is 100 (20 + 25 + 15 + 15 + 5 + 10 + 10).

## Rating bands

| Score | Rating |
|---|---|
| 80 to 100 | High indication of compliance |
| 50 to 79 | Moderate: Shari'ah Board review required |
| 0 to 49 | Low: structure likely non-compliant |

## Notes

- **Receivable-based structures.** Murabaha, istisna and salam pass check 1, but the note flags their secondary-market trading restrictions for the Board to confirm.
- **Inferred asset backing.** When the compare endpoint receives a sukuk without an explicit `asset_backed` flag, it infers it from the structure type (ijara, musharaka, mudaraba, wakala, diminishing musharaka). The response notes this, and the offering documents should confirm it.
- **Scope.** The checks cover structure, asset backing, profit rate and tenor. They do not review the purchase undertaking, the service agency agreement, Shari'ah board resolutions, or the jurisdiction's regulation. A qualified Shari'ah scholar must review every instrument before it is offered.

## Example

```bash
curl -X POST https://noorfinance-api.onrender.com/api/v2/compliance/check \
  -H "Content-Type: application/json" \
  -d '{"type": "ijara", "underlying_asset": "Office building", "tenor": 5,
       "profit_rate": 0.06, "asset_backed": true}'
```

This returns `"score": 100` with all seven checks passing.
