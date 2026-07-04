# Vortex Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paid premium plans with Dodo Payments auto-activation, coupon redemption, free-tier gating (2 active downloads), and an owner-only admin page.

**Architecture:** Entitlement lives in `users/{uid}/config/entitlement` (client-readable, server-only writable via firebase-admin). Pure logic (entitlement math, coupon codes, webhook signature) in `src/lib/premium/*` with vitest unit tests. Four API routes under `src/app/api/premium/`. Client consumes a `PremiumContext` (root layout) with live `onSnapshot`; gating happens in `TorrentContext.addMagnet`, `StreamPlayer`, settings, and release radar.

**Tech Stack:** Next.js 16 App Router, Firebase (client + admin), Dodo Payments REST API (`POST {DODO_API_BASE}/checkouts`), Standard Webhooks HMAC verification (hand-rolled, node:crypto), vitest.

## Global Constraints

- Plans: `monthly` = ₹89/$1/30 days; `halfyear` = ₹449/$5/180 days; `lifetime` = ₹3,299/$40/forever.
- Coupon durations: 30, 90, 180, 365 days, lifetime. Code format `VTX-XXXX-XXXX-XXXX`, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, stored as SHA-256 hex (doc ID = hash).
- Free tier: max **2** torrents with status `'Downloading' | 'Paused'` (engine statuses are `Downloading/Seeding/Paused/Completed`); seeding unlimited; no streaming of incomplete torrents; no auto-subtitles; no release radar.
- Time stacking always: `newExpiry = max(now, currentExpiry) + duration`. Lifetime is sticky (never downgraded by later grants).
- Existing torrents are never touched; the limit applies only at add time.
- Entitlement doc: `{ plan, premiumUntil: Timestamp|null, isLifetime: boolean, source: 'payment'|'coupon'|'admin', updatedAt }`. Missing doc ⇒ free.
- Env vars (server-only): `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_API_BASE` (`https://test.dodopayments.com` or `https://live.dodopayments.com`), `DODO_PRODUCT_MONTHLY`, `DODO_PRODUCT_HALFYEAR`, `DODO_PRODUCT_LIFETIME`, `ADMIN_UID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_UID` (UI visibility only).
- Never expose secrets with `NEXT_PUBLIC_`. All entitlement writes go through firebase-admin only.
- Follow the repo's existing style: 4-space indent in TSX contexts, Tailwind classes matching the dark glassmorphism theme (`bg-surface`, `border-white/[0.06]`, `text-text-2`, `bg-accent`).

---

### Task 1: Test infra + plan constants + entitlement math

**Files:**
- Modify: `package.json` (add vitest devDependency + `"test": "vitest run"` script)
- Create: `src/lib/premium/plans.ts`
- Create: `src/lib/premium/entitlement.ts`
- Test: `src/lib/premium/__tests__/entitlement.test.ts`

**Interfaces:**
- Produces: `PLANS` record (`planId → {durationDays|null, inr, usd, label}`), `FREE_MAX_ACTIVE_DOWNLOADS = 2`, `PlanId = 'monthly'|'halfyear'|'lifetime'`
- Produces: `computeGrant(current: EntitlementCore, grant: Grant, nowMs: number): EntitlementCore`, `isPremiumActive(ent: EntitlementCore|null, nowMs: number): boolean` where `EntitlementCore = { isLifetime: boolean; premiumUntilMs: number|null }`, `Grant = { durationDays: number } | { lifetime: true }`

- [ ] Step 1: `npm install` (node_modules missing), then `npm install -D vitest`, add `"test": "vitest run"` script.
- [ ] Step 2: Write failing tests: stacking from now when expired/absent; stacking from currentExpiry when active; lifetime grant; lifetime stickiness; isPremiumActive for null/expired/active/lifetime.
- [ ] Step 3: `npx vitest run` → FAIL (module not found).
- [ ] Step 4: Implement `plans.ts` + `entitlement.ts` (pure, ms-based, no Firebase imports).
- [ ] Step 5: `npx vitest run` → PASS. Commit `feat: premium plan constants and entitlement math`.

### Task 2: Coupon code utilities

**Files:**
- Create: `src/lib/premium/coupons.ts`
- Test: `src/lib/premium/__tests__/coupons.test.ts`

**Interfaces:**
- Produces: `generateCouponCode(): string` (`VTX-` + 3×4 chars), `normalizeCouponCode(input: string): string` (uppercase, strip all non-alphanumerics, drop leading VTX), `hashCouponCode(input: string): string` (sha256 hex of normalized), `COUPON_DURATIONS: { label: string; durationDays: number|null }[]` (null = lifetime).

- [ ] Step 1: Failing tests — format regex `^VTX(-[A-Z2-9]{4}){3}$`; normalize equivalence (`vtx-ab2 3-...` variants hash equal); distinct codes across 100 generations; hash is 64 hex chars.
- [ ] Step 2: Implement with `node:crypto` `randomInt` per char + `createHash('sha256')`.
- [ ] Step 3: `npx vitest run` → PASS. Commit `feat: coupon code generation and hashing`.

### Task 3: Standard-webhooks signature verification

**Files:**
- Create: `src/lib/premium/webhook-verify.ts`
- Test: `src/lib/premium/__tests__/webhook-verify.test.ts`

**Interfaces:**
- Produces: `verifyStandardWebhook(args: { payload: string; id: string; timestamp: string; signature: string; secret: string; nowMs?: number; toleranceSec?: number }): boolean`
- Semantics: secret `whsec_<base64>` → HMAC-SHA256 key; signed content `${id}.${timestamp}.${payload}`; header holds space-delimited `v1,<base64sig>` entries — any constant-time match passes; timestamp must be within tolerance (default 300 s).

- [ ] Step 1: Failing tests — valid signature passes (construct with same HMAC in test); wrong secret fails; expired timestamp fails; multiple space-delimited signatures where second is valid passes; malformed header fails (no throw).
- [ ] Step 2: Implement with `createHmac`, `timingSafeEqual` (length-guarded), try/catch → false.
- [ ] Step 3: `npx vitest run` → PASS. Commit `feat: standard-webhooks signature verification`.

### Task 4: Server-side premium operations (firebase-admin)

**Files:**
- Create: `src/lib/premium/server.ts`

**Interfaces:**
- Consumes: `adminDb`, `adminAuth` from `@/lib/firebase-admin`; Task 1–2 pure functions.
- Produces:
  - `requireUser(req: NextRequest): Promise<{ uid: string; email?: string }>` — Bearer ID token via `adminAuth.verifyIdToken`; throws `HttpError(401)`.
  - `requireAdmin(req): Promise<{ uid }>` — `requireUser` + `uid === process.env.ADMIN_UID`; throws `HttpError(403)`.
  - `class HttpError extends Error { status: number }`
  - `entitlementRef(uid)` → `users/{uid}/config/entitlement`.
  - `applyGrantTxn(txn, uid, grant, source, planLabel)` — read-modify-write using `computeGrant` (exported for reuse inside transactions).
  - `applyGrant(uid, grant, source, planLabel)` — wraps in `adminDb.runTransaction`.
  - `redeemCoupon(uid, rawCode): Promise<{durationDays: number|null}>` — ONE transaction: coupon doc (id = hash) must exist, `!redeemedBy`, `!revoked`; marks redeemed + applies grant. Throws `HttpError(404 invalid | 409 used | 410 revoked)`.
  - `checkRedeemRateLimit(uid)` — `couponAttempts/{uid}` doc `{count, windowStartMs}`, 10 attempts/hour, throws `HttpError(429)`.
  - `recordPaymentOnce(eventKey, record): Promise<boolean>` — transaction create-if-absent in `payments/{eventKey}`; false when already processed.

- [ ] Step 1: Implement (no unit tests — thin Firestore glue over tested pure logic; verified via build + manual E2E).
- [ ] Step 2: `npx tsc --noEmit` clean. Commit `feat: server-side entitlement and coupon operations`.

### Task 5: API routes (redeem, checkout, webhook, admin)

**Files:**
- Create: `src/app/api/premium/redeem/route.ts` — POST `{code}` + Bearer token → rate-limit, `redeemCoupon`, returns `{success, durationDays}`; friendly error messages per HttpError status.
- Create: `src/app/api/premium/checkout/route.ts` — POST `{plan}` + Bearer token → validate plan, map to `DODO_PRODUCT_*` env, `fetch(`${DODO_API_BASE}/checkouts`)` with `{product_cart:[{product_id, quantity:1}], customer:{email}, metadata:{uid, plan}, return_url:`${NEXT_PUBLIC_APP_URL}/upgrade?status=success`}`, Authorization `Bearer ${DODO_API_KEY}`; returns `{checkout_url}`; 502 with log on Dodo failure.
- Create: `src/app/api/premium/webhook/route.ts` — POST raw `await req.text()`; verify via Task 3 (401 on fail); parse JSON; only `type === 'payment.succeeded'` grants: `uid`/`plan` from `data.metadata`, eventKey = `data.payment_id ?? webhook-id header`; `recordPaymentOnce` then `applyGrant(uid, grantForPlan(plan), 'payment', plan)`; unknown/irrelevant events → `{received:true}` 200; processing errors → 500 (Dodo retries; idempotency makes retries safe).
- Create: `src/app/api/premium/admin/route.ts` — POST `{action, ...}` with `requireAdmin`. Actions: `generate {count≤100, durationDays|null}` → create coupon docs (id=hash), return plaintext codes once; `list` → latest 200 coupons + resolved redeemer emails via `adminAuth.getUsers`; `revoke {id}`; `grant {email, durationDays|null, remove?}` → `getUserByEmail`, applyGrant or delete entitlement doc when `remove`.

**Interfaces:**
- Consumes: everything from Tasks 1–4 exactly as named above.
- Produces: request/response shapes used by Tasks 7–8 UIs: redeem `{success:true, durationDays:number|null}` | `{error:string}`; checkout `{checkout_url:string}` | `{error}`; admin list `{coupons:[{id, durationDays, isLifetime, createdAt, redeemedBy, redeemedByEmail, redeemedAt, revoked}]}`, generate `{codes:string[]}`.

- [ ] Step 1: Implement all four routes with explicit error handling; no secrets in responses.
- [ ] Step 2: `npx tsc --noEmit` + `npm run lint` clean. Commit `feat: premium API routes (checkout, webhook, redeem, admin)`.

### Task 6: PremiumContext + layout wiring + gate in TorrentContext

**Files:**
- Create: `src/context/PremiumContext.tsx`
- Create: `src/components/UpgradeModal.tsx`
- Modify: `src/app/layout.tsx` (wrap children with `PremiumProvider` inside `AuthProvider`)
- Modify: `src/app/(protected)/layout.tsx` (render `<UpgradeModal />` inside `TorrentProvider`)
- Modify: `src/context/TorrentContext.tsx` (gate `addMagnet`)

**Interfaces:**
- Produces: `usePremium(): { isPremium, isLifetime, plan, premiumUntil: Date|null, loading, isAdmin, limitModalOpen, openLimitModal(reason: string), closeLimitModal }`. Firestore listener: `onSnapshot(doc(db, 'users', uid, 'config', 'entitlement'))`; missing doc → free; derive with `isPremiumActive`. `isAdmin = uid === process.env.NEXT_PUBLIC_ADMIN_UID`.
- Gate in `addMagnet` (TorrentContext, before axios call):

```ts
const activeDownloads = torrents.filter(t => t.status === 'Downloading' || t.status === 'Paused').length;
if (!isPremium && activeDownloads >= FREE_MAX_ACTIVE_DOWNLOADS) {
    openLimitModal('download-limit');
    const err = new Error('FREE_LIMIT_REACHED');
    (err as any).code = 'FREE_LIMIT_REACHED';
    throw err;
}
```

- `UpgradeModal`: fixed overlay, crown icon, copy per reason (`download-limit` / `streaming` / `subtitles` / `release-radar`), CTA → `/upgrade`, dismiss button. Uses framer-motion like existing modals.

- [ ] Step 1: Implement context/provider/modal; wire layouts; gate addMagnet (search page already try/catches addMagnet — swallow `FREE_LIMIT_REACHED` there without generic error toast).
- [ ] Step 2: `npx tsc --noEmit` + lint. Commit `feat: premium context, upgrade modal, download limit gate`.

### Task 7: Upgrade page

**Files:**
- Create: `src/app/(protected)/upgrade/page.tsx`

**Interfaces:**
- Consumes: `usePremium`, `PLANS`, `/api/premium/checkout`, `/api/premium/redeem`, `auth.currentUser.getIdToken()`.

Content: current-plan banner (plan + expiry or lifetime); three plan cards (₹ primary, $ secondary, features list; lifetime highlighted "Best value"); buy → POST checkout with ID token → `window.location.href = checkout_url`; `?status=success` → "Payment received — activating…" state that resolves when `isPremium` flips via snapshot; redeem input (auto-uppercase) → POST redeem → success/error inline; free-tier vs premium feature comparison.

- [ ] Step 1: Implement page matching the app's dark glass aesthetic.
- [ ] Step 2: tsc + lint. Commit `feat: upgrade page with checkout and coupon redemption`.

### Task 8: Admin page

**Files:**
- Create: `src/app/(protected)/admin/page.tsx`

**Interfaces:**
- Consumes: `usePremium().isAdmin` (render guard; server enforces regardless), `/api/premium/admin`.

Content: redirect non-admins to `/`; Grant section (email, duration select incl. lifetime + Remove premium button); Generate section (duration select, count 1–100 → plaintext codes list with copy-all); Coupons table (created, duration, status chip unused/redeemed/revoked, redeemer email, revoke button for unused).

- [ ] Step 1: Implement page.
- [ ] Step 2: tsc + lint. Commit `feat: admin page for coupons and manual grants`.

### Task 9: Remaining feature gates (sidebar, settings, streaming, radar)

**Files:**
- Modify: `src/components/Sidebar.tsx` — "Upgrade" nav item with crown (label shows PRO when premium; hidden when lifetime); "Admin" item when `isAdmin`.
- Modify: `src/app/(protected)/settings/page.tsx` — Plan card (status, expiry, manage → /upgrade); auto-subtitle toggle: when `!isPremium` render disabled + crown chip and `openLimitModal('subtitles')` on click; on settings load, if `autoSubtitle === true && !isPremium && !loading` silently `updateSettings({ autoSubtitle: false })` once.
- Modify: `src/components/StreamPlayer.tsx` — after torrent lookup by infoHash: if `!isPremium` and torrent exists with status `Downloading`/`Paused` → render locked overlay ("Streaming while downloading is Premium") with CTA `/upgrade` instead of the player (completed/seeding files stream free).
- Modify: `src/app/(public)/release-radar/page.tsx` — signed-in non-premium users get a blurred lock overlay with CTA (PremiumProvider is global, so `usePremium` works on public pages); signed-out behavior unchanged.

- [ ] Step 1: Implement all four gates.
- [ ] Step 2: tsc + lint. Commit `feat: premium gates for sidebar, settings, streaming, release radar`.

### Task 10: Rules comment, env template, docs, verification

**Files:**
- Modify: `firestore.rules` — comment block documenting entitlement/coupons/payments invariants (no functional change: config write-list already excludes `entitlement`; unmatched collections are denied by default).
- Create: `.env.example` — all new vars with placeholder values + comments.
- Modify: `README.md` — "Premium & Payments" section (plans, Dodo setup steps, env vars, admin page).
- [ ] Step 1: Write all three.
- [ ] Step 2: `npm run test` (all green), `npm run lint`, `npm run build` (must succeed).
- [ ] Step 3: Commit `docs: premium setup documentation and env template`.

---

## Manual E2E checklist (post-implementation, needs owner's Dodo test keys)

1. Free user: add 2 torrents → 3rd blocked with modal.
2. Redeem a generated 30-day code → premium live, limit gone; same code again → "already used".
3. Test-mode Dodo payment → webhook → premium within seconds; replayed webhook → no double credit.
4. Admin grant by email + remove.
5. Free user streaming an incomplete torrent → locked; completed file → plays.
