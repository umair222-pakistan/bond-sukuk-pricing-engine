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
parameter. The signed webhook's purchaser email must match a Supabase Auth
profile before that profile is updated.

1. Apply the Supabase migrations in timestamp order, including
   `20261009210000_profiles_signup_and_payment_orders.sql`,
   `20261010110000_license_key_activation.sql`, and
   `20261010120000_license_user_binding.sql`,
   `20261010130000_license_activation_timestamp.sql`, and
   `20261010140000_license_tier_entitlements.sql`. These migrations provision
   tiered license claiming and profile entitlements. RLS stays enabled;
   `service_role` is granted server-side access, while authenticated users may
   only read their own profile.
2. Set these server-side Vercel environment variables for every deployed
   environment:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (required for license lookup and update;
     server-side only; never use a `VITE_` prefix)
   - `LEMONSQUEEZY_WEBHOOK_SECRET`
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (server-side Resend credentials;
     the sender address must be verified for production)
   - `LEMONSQUEEZY_BASIC_VARIANT_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, and
     `LEMONSQUEEZY_ENTERPRISE_VARIANT_ID` (map signed webhook `variant_id` values
     to the persisted subscription tier)
   - `LICENSE_BRUTE_FORCE_FALLBACK=false` (leave disabled in production; enabling
     it deliberately grants Pro to any syntactically valid NF-/NOOR- key that
     is absent from the database)
   - `NEXT_PUBLIC_LEMON_BASIC_URL`, `NEXT_PUBLIC_LEMON_PRO_URL`, and
     `NEXT_PUBLIC_LEMON_ENTERPRISE_URL` (public checkout URLs bundled by Vite)
   - Optionally set `LEMONSQUEEZY_ALLOW_TEST_MODE=true` only on a non-production
     deployment to accept test-mode license events. Production ignores them.
   Redeploy after changing environment variables.
3. In Vercel, set the project **Root Directory** to `frontend`. The Vite build
   outputs `dist/`; Vercel discovers the Python functions under `frontend/api/`
   and the shared `frontend/license_service.py` module.
4. In Lemon Squeezy, create a webhook pointing to
   `https://noorfinance.vercel.app/api/webhook/simple`, using the same signing
   secret as `LEMONSQUEEZY_WEBHOOK_SECRET`. This route delegates to the signed
   `api/webhooks/lemonsqueezy` handler. Subscribe to `order_created`,
   `order_refunded`, `subscription_created`, `subscription_updated`,
   `subscription_cancelled`, `subscription_expired`, `subscription_paused`,
   `subscription_resumed`, and `subscription_unpaused`. Both the simple and
   plural webhook URLs delegate to the same signature-checked handler; configure
   only one URL in Lemon Squeezy.
5. Set the successful checkout redirect to
   `https://noorfinance.vercel.app/activate` without license or email query
   parameters. The checkout requires a signed-in account; the webhook stores
   the variant-mapped plan and issues a license key to the purchaser email.

The frontend checks `GET /api/license/verify` with the current Supabase access
token. For paid order and subscription events, the webhook updates the matching
profile and upserts the license by Lemon Squeezy order ID using the Supabase
service-role key. Profiles are matched against the verified purchaser email in
the signed webhook. Local development of these Vercel functions requires the
Vercel CLI (`vercel dev`) from the repository root.

The legacy `/api/webhooks/lemonsqueezy` handler lives in the repository-root
`api/` directory. The current Vercel setup uses `frontend` as its Root
Directory, so the new `/api/webhook/simple` handler is served from
`frontend/api/` without changing the existing deployment root.

This repository is a Vite app with Vercel Python functions, not a Next.js
App Router project. Frontend variables use `VITE_` or explicitly public
`NEXT_PUBLIC_` checkout URL prefixes; `SUPABASE_SERVICE_ROLE_KEY` and
`LEMONSQUEEZY_WEBHOOK_SECRET` are server-only.
