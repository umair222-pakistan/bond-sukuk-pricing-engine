# Bond & Sukuk Pricing Engine (Mithaq)

## Run

Terminal 1 — API:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Terminal 2 — UI:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` to uvicorn on port 8000).

## Endpoints

- `POST /api/price/bond`
- `POST /api/price/sukuk` (Ijara: rentals + face at maturity)
- `POST /api/analytics/duration`
- `GET /api/yield-curve`

Body for POSTs:

```json
{ "face": 1000, "coupon": 0.06, "yield": 0.05, "years": 10, "freq": 2 }
```

Percents like `6` are accepted and converted to decimals.
