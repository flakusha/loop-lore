<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Admin-set secrets stored plaintext in system_config

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-crypto
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

setConfig is bare insert/upsert with no encryption (src/admin/config.ts:83-102); only YAML/TOML export redacts. Asymmetric with BYOK AES-GCM. Fix: encrypt secret-classified keys at rest or exclude from GET /admin/system-config.

**Context:**

The reported short-circuit was checked first and is not the defect: `src/crypto/at-rest.ts` governs chat message bodies (per-chat encryption tier), never the `system_config` table, so its tier-"none" exclusion never touched admin writes. The real defect is the bare upsert in `src/admin/config.ts` — every admin-written secret (API key, token, DB URL) landed in `system_config` as plain text, and the only protection was *response* redaction in the GET/export handlers, which does nothing for the row on disk.

Constraints: reuse the existing credential envelope (`src/integrations/secrets.ts` — the same `secret:v1:` SMK-wrap AES-GCM envelope the adapter credentials already use) instead of inventing a scheme; every existing read path must keep handing callers plain text; the live hot-apply snapshot must still receive the plain value; no new config knob.

Alternative considered — excluding secret-classified keys from `GET /admin/system-config`: rejected, it leaves the plain-text row on disk and breaks the admin panel's ability to read a stored secret back.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (no user-facing surface changed — the admin panel and the export endpoint show the same values as before; the storage form is recorded here)

## Resolution

New module `src/admin/config-secrets.ts` classifies a key with the existing `SECRET_KEY_PATTERN` (`src/admin/config-keys.ts:12`) and seals/opens values through the existing credential envelope.

- `src/admin/config.ts:102` — `setConfig` seals the value before the upsert (`sealConfigValue`), so the row never holds plain text. The live snapshot still gets the plain value through `applyConfigWrite` (`src/admin/config.ts:113`).
- `src/admin/config.ts:51`, `:66`, `:78` — `getAllConfig` / `getConfig` / `getConfigValue` open sealed values before returning them, so the admin panel, the export endpoint and every other caller keep seeing plain text.
- `src/admin/config-secrets.ts:52` — a secret write without key material is refused with a `SecretEnvelopeError` naming the key (never the value) instead of falling back to plain text.
- Legacy plain-text rows still read back as plain text: the stored form is self-describing (`secret:v1:` prefix), so only sealed values are opened.

Regression tests: `src/admin/config-secrets.test.ts` — "a secret-classified key is stored sealed, never as plain text" (fails before the fix: the row held the value verbatim), "a sealed value reads back as plain text", "a secret write without key material is refused instead of stored in plain text", "a legacy plain-text row still reads back as plain text". `src/routes/admin/system-config.test.ts` — "PATCH stores a secret value sealed, never verbatim" (was "PATCH still stores a secret value verbatim").
