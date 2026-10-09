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

## Lemon Squeezy license provisioning

License access is granted only after the server receives a signed Lemon Squeezy
license-key webhook. The browser never receives a license key from a redirect
query parameter. The authenticated account email must match the checkout email.

1. Apply `supabase/migrations/20261009190000_noorfinance_licenses.sql` to the
   Supabase project.
2. Set these server-side Vercel environment variables for every deployed
   environment:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never use a `VITE_` prefix)
   - `LEMONSQUEEZY_WEBHOOK_SECRET`
   - `LEMONSQUEEZY_PRODUCT_IDS` (comma-separated Lemon Squeezy product IDs
     allowed to grant access; unrelated products are ignored)
   - Optionally set `LEMONSQUEEZY_ALLOW_TEST_MODE=true` only on a non-production
     deployment to accept test-mode license events. Production ignores them.
3. Deploy this repository with its **root directory set to the repository root**.
   The root `vercel.json` builds the frontend from `frontend/` and exposes the
   Python functions in `api/`.
4. In Lemon Squeezy, create a webhook pointing to
   `https://noorfinance.vercel.app/api/webhook/lemonsqueezy`, using the same
   signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET`. Subscribe to
   `license_key_created` and `license_key_updated`, and enable license keys for
   the products. Configure the product/license expiry to match each plan.
5. Set the successful checkout redirect to
   `https://noorfinance.vercel.app/activate` without license or email query
   parameters. The customer must complete checkout using the same email as
   their NoorFinance account.

The frontend checks `GET /api/license/verify` with the current Supabase access
token. The webhook stores only license metadata in Supabase; it does not store
or expose the Lemon Squeezy license key. Local development of these Vercel
functions requires the Vercel CLI (`vercel dev`) from the repository root.
