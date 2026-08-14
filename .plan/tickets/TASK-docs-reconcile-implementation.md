# TASK: Reconcile specs + API reference with implementation

**Status:** 🟡 In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation.md

## Summary

Audit the most-cited, user-facing docs against actual `src/` and fix confirmed
stale claims (endpoint paths/methods, field names, UI flows).

## Acceptance Criteria

- [ ] Scout audit completed across assets, actors, messages, chat/gallery/
      settings/characters/worlds frontend docs, and `docs/reference/api.md`
- [ ] Confirmed mismatches updated in the docs
- [x] `docs/reference/api.md` endpoint list matches `src/routes/*.ts`

## Notes

Audit is read-only first (findings), then targeted edits. Only confirmed
mismatches are changed — aspirational/future-marked content is left alone.

**Progress (2026-08-14):** `/api` endpoint list reconciled against `src/routes/*.ts`
(scout audit) — all 26 documented endpoints exist and are wired via
`src/app/register-plugins.ts`; only path-param-name cosmesis differs (`:id` vs
`:chatId`, `:locId` vs `:locationId`) — no reachability gap. Fixes applied:
duplicate `## Authentication` section renamed to `## Authentication Endpoints`
(`docs/reference/api.md`), and all 17 broken internal markdown links fixed
(`docs/README.md` + `docs/spec/{build-deploy,battle-integration,nsfw-integration}.md`)
— 2 dropped (no matching spec: `content-management.md`, `housing.md`),
remaining 15 repointed to real specs (`check-md-links`: 195 files, all resolve).
The assets/actors/messages/chat/gallery/settings/characters/worlds frontend-docs
audit (criteria 1–2) remains open.