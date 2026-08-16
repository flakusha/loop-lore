<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Signed URLs for Asset Downloads

**Status:** ✅ Done (2026-08-16) — mechanism shipped in `in-chat-asset-preview` worktree
**Priority:** Medium
**Effort:** Small
**Epic:** epic-asset-support-expansion

## Summary

Generate signed, time-limited URLs for secure asset downloads. Prevents direct file access and enables access control. From `epic-asset-support-expansion.md` (inferred).

## Scope

### Signed URL Generation

- Time-limited URLs (5-15 min expiry)
- HMAC signature for integrity
- Path-based signing

### Access Control

- Permission checks before signing
- User/role-based access
- Asset ownership verification

### Integration

- Download endpoints use signed URLs
- Frontend requests signed URLs
- Asset storage abstraction

## Acceptance Criteria

- [x] Signed URL generation with HMAC signature
- [x] Time-limited URLs with configurable expiry
- [x] Permission checks before URL generation
- [x] Asset ownership verification
- [x] Download endpoints use signed URLs
- [~] Frontend requests signed URLs for assets — mechanism shipped; frontend adoption (download flow + in-chat linkage) lands with Item 7 side panel
- [x] Unit tests for URL signing
- [x] Integration tests for download workflow

## Verified Implementation (2026-08-16)

- **Signing module** — `src/assets/controller/signed-url.ts`:
  - `signAssetUrl()` / `verifyAssetUrl()` — HMAC-SHA256 (Web Crypto, mirroring `src/auth/jwt.ts`), base64url signature over `${action}:${assetId}:${expiresAt}`. Constant-time byte compare via `.entries()` index pairing.
  - Actions bound: `raw` | `download` | `thumb` | `compressed` — a token for one action cannot serve another.
  - `resolveSignedUrlSecret()` — prefers `assets.signedUrlSecret`, falls back to `auth.jwtSecret`; returns null (fail closed) when neither set.
- **Generation endpoint** — `POST /api/assets/:id/signed-url/:action` returns `{ url, token, expiresAt }`; gated by the same `resolveAsset` access check as serving (owner/admin/public/shared).
- **Verify-on-serve** — `handleServeRawRoute`/`handleDownloadRoute`/`handleCompressedRoute` accept `?expires=<epochMs>&sig=<token>`: when present, verified instead of session auth (enables `<img src>` without a fresh session); absent → existing session auth unchanged (no frontend breakage).
- **Config** — `AssetsConfig.signedUrlSecret` + `.signedUrlExpirySeconds` (default 900s) added to `schema/assets.ts`, `schema-class/assets.ts`, `sections/assets.ts`, `json-schema/assets.ts`; env overrides `ASSETS_SIGNED_URL_SECRET` / `ASSETS_SIGNED_URL_EXPIRY_SECONDS` in `env-map.ts`.
- **Tests** — `signed-url.test.ts` (15 unit: round-trip, expiry, tamper, wrong action/asset/secret, malformed, fail-closed secret, constant-time guard) + `signed-url.routes.test.ts` (7 integration: generate→serve, cross-action reject, expired, tampered, no-secret fail-closed, access gate, unknown action).
- **Verification** — `bun run check` gate: 20/22 green. 2 red are `size/strict` on pre-existing dev-HEAD files (10 files over 250L, incl. proactive-messaging `index.ts` 285L) — NOT from this work; `handlers.ts` kept at 202L via split into `signed-url-routes.ts`. `size/check` (new-violation gate), typecheck ×4, lint, dprint, db schema, wiring, unit (41 assets) + e2e all green.
- **Split for size** — signed-URL route handling (`signedAuthParams`, `handleServeRawRoute`/`Download`/`Compressed`, `handleSignedUrlRoute`) extracted to `src/assets/controller/signed-url-routes.ts` to keep `handlers.ts` under the 250L strict threshold.

## Notes

- Frontend `feFetch`/`<img>` integration deferred to Item 7 (in-chat asset preview + linkage side panel), which builds on this mechanism.
- `schemas:check` fails on dev baseline with a pre-existing `ConfigSchema`-as-value import bug in `scripts/check-schemas.ts` (type exported, imported as value) — not introduced here.
- Consider CDN integration for asset delivery (future).
