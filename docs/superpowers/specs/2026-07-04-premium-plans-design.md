# Vortex Premium Plans — Design Spec

**Date:** 2026-07-04
**Status:** Approved by owner
**Scope:** Add paid premium plans to Vortex with automated payment activation (Dodo Payments), coupon redemption, free-tier feature gating, and an owner-only admin page.

---

## 1. Goals

- Monetize Vortex with three paid plans, priced in INR for India and USD internationally.
- Payment must auto-activate premium on the buyer's account — no manual steps for the owner.
- Support international buyers (cards/PayPal/local methods) and Indian buyers (UPI/cards).
- Coupon codes (1/3/6/12 months, lifetime) as giveaway mechanism and fallback sales channel.
- Existing users move to the free tier at launch with zero disruption to in-progress torrents.

## 2. Plans and pricing

| Plan | India | International | Grants |
|------|-------|---------------|--------|
| Free | — | — | Search + max **2 actively downloading torrents**; unlimited seeding; no streaming-while-downloading, no auto-subtitles, no release radar |
| Monthly | ₹89 | $1 | 30 days premium |
| Half-year | ₹449 | $5 | 180 days premium |
| Lifetime | ₹3,299 | $40 | Permanent premium |

Premium = unlimited torrents + all gated features.

**Fee note (accepted by owner):** Dodo charges ~4% + $0.40/txn, so the monthly plan nets only ~₹50 of ₹89. Half-year and lifetime have healthy margins.

**Coupon durations:** 30, 90, 180, 365 days, and lifetime. Single-use, owner-generated.

## 3. Payment provider

**Dodo Payments** (Merchant of Record):
- Handles UPI/RuPay for India, cards/PayPal/local methods for 190+ countries.
- Handles GST/VAT/tax compliance itself; pays out to an Indian bank account (FEMA-compliant export payments).
- Hosted checkout + signed webhooks for auto-activation.

**Risk (acknowledged):** all payment providers prohibit piracy-facilitating products. If Dodo's review rejects or later bans the product, the coupon system + manual UPI sales remain the fallback. Owner-side setup (KYC, product creation, API keys) is a prerequisite — see §10.

## 4. Data model (Firestore)

### 4.1 `users/{uid}/config/entitlement` — the single source of truth

```
{
  plan: 'free' | 'monthly' | 'halfyear' | 'lifetime',
  premiumUntil: Timestamp | null,   // null when lifetime or free
  isLifetime: boolean,
  source: 'payment' | 'coupon' | 'admin',
  updatedAt: Timestamp
}
```

- **Missing doc ⇒ free tier.** This is the entire migration story for existing users: no backfill needed.
- `isPremium` (derived, never stored) = `isLifetime || premiumUntil > now`.
- **Security:** clients may READ their own entitlement; NO client may write it. The existing `config/{documentId}` rules already allow writes only for `settings` and `stats` doc IDs, so `entitlement` is client-write-proof as-is. All writes go through Next.js API routes using `firebase-admin` (bypasses rules). Firestore rules gain an explicit comment documenting this invariant.
- Time extensions always stack: `newExpiry = max(now, currentExpiry) + duration`.

### 4.2 `coupons/{couponId}` — no client access

```
{
  codeHash: string,          // SHA-256 of the plaintext code; plaintext shown once at creation
  durationDays: number | null,
  isLifetime: boolean,
  createdAt: Timestamp,
  redeemedBy: string | null, // uid
  redeemedAt: Timestamp | null,
  revoked: boolean
}
```

Code format: `XXXX-XXXX-XXXX` from a crypto-random alphabet (no ambiguous chars). No Firestore rule matches this collection ⇒ denied to all clients by default.

### 4.3 `payments/{eventId}` — audit log, no client access

One doc per processed webhook event, keyed by Dodo's event/payment ID. Serves as the **idempotency guard** (event already recorded ⇒ skip) and the audit trail: `{ uid, plan, amount, currency, dodoPaymentId, status, createdAt }`.

## 5. Server (Next.js API routes on Vercel, all using firebase-admin)

| Route | Auth | Behavior |
|-------|------|----------|
| `POST /api/checkout` | Firebase ID token | Body `{ plan }`. Creates a Dodo checkout session with `metadata.uid` + plan; returns hosted checkout URL. |
| `POST /api/webhooks/dodo` | Dodo webhook signature | Verify signature (reject otherwise). On payment-succeeded: idempotency check via `payments/{eventId}`, then extend entitlement per §4.1, write audit doc. Non-success events are recorded but grant nothing. |
| `POST /api/redeem` | Firebase ID token | Body `{ code }`. Hash code → Firestore transaction: coupon exists ∧ !redeemed ∧ !revoked → mark redeemed, extend entitlement. Rate-limited per uid (simple attempt counter doc) to block brute force. Clear error messages: invalid / already used / revoked. |
| `POST /api/admin/coupons` | ID token, uid === `ADMIN_UID` | Actions: generate batch (returns plaintext codes **once**), list with status, revoke. |
| `POST /api/admin/grant` | ID token, uid === `ADMIN_UID` | Look up user by email; grant/extend/remove premium manually (support escape hatch). |

Environment variables (Vercel): `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `ADMIN_UID`, product IDs for the three plans. None exposed with `NEXT_PUBLIC_` except non-secret product/display config if needed.

## 6. Client

- **`usePremium()` hook** (new `PremiumContext`): `onSnapshot` on the entitlement doc → `{ isPremium, plan, premiumUntil, loading }`. Missing doc → free. Fail-open only for UI display; destructive assumptions avoided while `loading`.
- **`/upgrade` page** (protected): three plan cards (INR primary; USD noted for international), pay button → `/api/checkout` → redirect to Dodo → return to `/upgrade?status=success` where the page waits on the entitlement snapshot to confirm activation. Below: "Redeem a code" input → `/api/redeem`.
- **Gating:**
  - `addMagnet` path (TorrentContext + search/downloads UI): if free ∧ actively-downloading count ≥ 2 → block + upgrade modal.
  - Streaming-while-downloading, auto-subtitles, release radar: locked with a crown/upsell for free users.
  - Settings page shows current plan + expiry + link to `/upgrade`.
- **`/admin` page** (protected): rendered only for `ADMIN_UID` (server enforces on every API call regardless): coupon generation/listing/revocation, manual grant by email.

## 7. Existing users & existing torrents

- Launch behavior: no entitlement doc ⇒ free tier. No data migration.
- **In-progress torrents are never touched.** The 2-torrent limit applies only when *adding* a torrent. A user with 5 active downloads at launch keeps them; they can't add a 6th until below the limit.
- Seeding never counts toward the limit (protects the ratio/leaderboard culture).

## 8. Enforcement honesty (accepted limitation)

The engine runs on the user's own machine and the repo is public: a technical user can patch client-side checks. The entitlement record itself is tamper-proof (server-only writes), but v1 feature enforcement is UI-level. Engine-side entitlement checks are a possible v2 hardening, out of scope here.

## 9. Error handling

- Webhook: signature failure → 401, no state change. Processing error → 500 so Dodo retries; idempotency guard makes retries safe.
- Redeem: transactional — a coupon can never be double-redeemed; user-facing errors distinguish invalid/used/revoked.
- Checkout: Dodo unreachable → friendly error + retry on the upgrade page.
- Entitlement listener failure → app treats user as free for gated actions but shows a "couldn't verify plan" notice rather than silently downgrading messaging.

## 10. Owner setup checklist (outside code)

1. Create Dodo Payments account, complete KYC (PAN + bank). Describe the product carefully (product-review risk, §3).
2. Create 3 products with INR/USD pricing; note product IDs.
3. Configure webhook endpoint → `https://<domain>/api/webhooks/dodo`; note webhook secret.
4. Set Vercel env vars: `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `ADMIN_UID`, product IDs.
5. Test-mode purchase end-to-end before going live.

## 11. Testing

- Unit: entitlement math (stacking, lifetime, expiry), coupon hashing/validation, webhook signature verification, admin auth guard.
- Integration: redeem transaction (double-redeem race), webhook idempotency (duplicate event), checkout route auth.
- E2E (manual + Playwright where feasible): free user hits torrent limit → upgrade modal; redeem happy path; admin coupon lifecycle; simulated webhook activates premium live in UI.

## 12. Out of scope (v1)

- Auto-recurring subscriptions (one-time fixed-duration purchases only; avoids RBI e-mandate complexity).
- Refund automation (handle manually via Dodo dashboard + `/api/admin/grant`).
- Engine-side enforcement.
- Regional pricing beyond INR/USD.
