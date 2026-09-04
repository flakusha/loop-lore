<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW consent state is in-memory only, never persisted

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-integration-gaps
**Related:** `src/middleware/nsfw-gate/consent.ts`, `TASK-consent-schema.md`, `epic-shared-schemas.md`

## Summary

`TASK-consent-schema.md` is marked **done** (the `ConsentState` schema module
exists in `src/schemas/consent.ts`). However the NSFW gate
(`src/middleware/nsfw-gate/consent.ts`) does not persist or read consent:

- `loadOrCreateConsent()` always returns a **fresh default** `ConsentState`
  (auto-grants `nsfw_encounter` for the userId) — code comment: "Full DB
  persistence requires a consent_state table (Phase 2)".
- `recordNsfwConsent()` returns an in-memory state only; nothing is written to
  the DB. There is no `consent_state` table.

Consequence: consent revocation / grant is lost on every process restart, and
the gate does not actually enforce persisted user consent — it silently
auto-consents. This contradicts the "consent-aware NSFW gating" intent and the
shared-schema epic's claim that the gate "consumes `ConsentState`".

## Acceptance Criteria

- [ ] A `consent_state` (or equivalent) persistence layer exists (migration + Kysely type).
- [ ] `loadOrCreateConsent()` reads persisted state; falls back to default only when none exists.
- [ ] `recordNsfwConsent()` writes the transition (grant/revoke + audit entry) to the DB.
- [ ] `checkNsfwWithConsent()` enforces persisted consent (not auto-granted) when `config.nsfw.consentRequired` is true.
- [ ] Tests cover: grant → enforce, revoke → deny, restart persistence.
- [ ] `TASK-consent-schema.md` / `epic-shared-schemas.md` notes updated to reflect persistence landed.

## Notes

- `src/schemas/consent.ts` already provides `createConsentState`, `recordConsentAction`, `isActionConsented`, `ConsentAuditEntry` — the contract is ready; only the middleware persistence is missing.
- Out of scope for this bug: UI for consent prompts (track separately if needed).


## Resolution

Stale — already implemented by migration `069_nsfw_consent_state.ts` (`nsfw_consent_state` ledger with `idx_nsfw_consent_state_user_chat_created` and `idx_nsfw_consent_state_chat` indices). `src/middleware/nsfw-gate/consent.ts` now uses `getLatestConsent` + `hasActiveConsent` from `./consent-ledger`; the old `loadOrCreateConsent` in-memory auto-grant was removed (docstring §1: "The earlier in-memory auto-grant path was removed for BUG-nsfw-consent-auto-granted"). `recordConsentAction` is the only writer needed at runtime; the gate enforces persisted consent under `config.nsfw.consentRequired`.

