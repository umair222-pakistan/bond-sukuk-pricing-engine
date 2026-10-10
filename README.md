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

## Lemon Squeezy payment and license provisioning

Payment entitlements are granted only after the server receives a signed Lemon
Squeezy webhook. The browser never receives a license key from a redirect query
parameter. Checkout user ID and email must match the corresponding Supabase
Auth account before its profile is updated.

1. Apply the Supabase migrations in timestamp order, including
   `20261009210000_profiles_signup_and_payment_orders.sql`. This migration
   creates the signup profile trigger and the service-role-only `licenses`
   order table.
2. Set these server-side Vercel environment variables for every deployed
   environment:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never use a `VITE_` prefix)
   - `LEMONSQUEEZY_WEBHOOK_SECRET`
   - `LEMONSQUEEZY_PRODUCT_IDS` (comma-separated product IDs allowed for
     license-key webhooks)
   - Optionally set `LEMONSQUEEZY_ALLOW_TEST_MODE=true` only on a non-production
     deployment to accept test-mode license events. Production ignores them.
3. In Vercel, set the project **Root Directory** to `frontend`. The Vite build
   outputs `dist/`; Vercel discovers the Python functions under `frontend/api/`
   and the shared `frontend/license_service.py` module.
4. In Lemon Squeezy, create a webhook pointing to
   `https://noorfinance.vercel.app/api/webhooks/lemonsqueezy`, using the same
   signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET`. Subscribe to
   `order_created`, `order_refunded`, `subscription_created`,
   `subscription_updated`, `subscription_cancelled`, `subscription_expired`,
   `subscription_paused`, `subscription_resumed`, and
   `subscription_unpaused`.
5. Set the successful checkout redirect to
   `https://noorfinance.vercel.app/activate` without license or email query
   parameters. The customer must complete checkout using the same email as
   their NoorFinance account.

The frontend checks `GET /api/license/verify` with the current Supabase access
token. For paid order and subscription events, the webhook updates the matching
profile to the Basic plan and upserts the payment record by Lemon Squeezy event
ID using the Supabase service-role key. Profiles are matched against the
verified purchaser email in the signed webhook. Local development of these
Vercel functions requires the Vercel CLI (`vercel dev`) from the repository root.

The webhook handler lives in the repository-root `api/` directory. The existing
Vercel setup uses `frontend` as its Root Directory, so deploy this handler only
after configuring Vercel to include the repository-root API function; otherwise
the SPA rewrite may serve the frontend instead of the webhook.

This repository is a Vite app with Vercel Python functions, not a Next.js
App Router project. Frontend variables therefore use the `VITE_` prefix;
`SUPABASE_SERVICE_ROLE_KEY` and `LEMONSQUEEZY_WEBHOOK_SECRET` are server-only.
