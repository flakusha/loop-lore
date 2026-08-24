<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: API key authentication middleware

**Status:** ⬜ Open
**Priority:** medium
**Effort:** Medium
**Epic:** epic-headless-alternative-frontends
**Related:** `epic-headless-alternative-frontends.md` (line 221), `TASK-api-first-foundation.md`, `TASK-cors-middleware.md`, `src/middleware/`

## Summary

The headless/alternative-frontends epic lists "Add API key authentication
middleware" as a required building block, but no `src/middleware/api-key.ts`
exists and no ticket tracked it. Programmatic/external API consumers need a
non-cookie auth path (Bearer API key or `ll_token`-equivalent) distinct from the
interactive JWT/session login flow.

## Acceptance Criteria

- [ ] `src/middleware/api-key.ts` implements API-key extraction (header `Authorization: Bearer <key>` and/or `X-API-Key`) + validation against a stored key (hashed).
- [ ] API keys are scoped (e.g., per-user, optionally per-scope) and revocable; raw key shown once on creation, hash stored.
- [ ] Wired as an alternative auth path that populates `RequestContext` (userId/userRole) alongside the existing JWT/solo flow.
- [ ] Works with `TASK-cors-middleware.md` for cross-origin programmatic callers.
- [ ] Unit tests: valid key, invalid key, missing key, revoked key, scope enforcement.
- [ ] `epic-headless-alternative-frontends.md` checklist item marked done.

## Notes

- Reuse the existing `authenticate()` contract / `RequestContext` shape so downstream guards (`requirePermission`, `adminViewGuard`) work unchanged.
- Storage: a new `api_keys` table (migration + Kysely type) keyed by hash; never store raw key.
- Referenced previously (planned) in `TASK-api-first-foundation.md`; point that reference here once created.
