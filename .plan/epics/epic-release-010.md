# EPIC: Release 0.1.0

**Status:** 🟡 In Progress (Gate C complete 2026-08-14; release blockers: tag + push)
**Priority:** High
**Effort:** Medium
**Type:** Release Epic
**Tags:** release, 0.1.0, gate, hardening, tag, changelog

## Summary

Consolidate the "Road to Happy 0.1.0" workstack (previously scattered across
`../backlog/priority.md` "Open → close" + "Hardening" + `../backlog/open.md` § Release
hardening) into one tracked epic so a single agent can drive the release. `package.json`
already declares `version: 0.1.0`.

## Current State (verified 2026-08-15)

- **Gate C complete** ✅ — VN, chat, assistant + tool-call UI, GM panels + quest log,
  auth/access incl. world/location, gallery, **GM-guided story (P2-Da) done 2026-08-14**
  (merged to `dev`: `480434d6`, `3f85b74b`, `4b0dd146`).
- `bun run check` gate **green** (2026-08-14) — lint-ts closed (0 errors; warnings tracked);
  size-strict closed 2026-08-12.
- e2e browser suite **stable** (2026-08-14) — auth redirect-loop was timing flake, fixed.
- `dev` ahead of `origin/dev` (unreleased: Gate C + item-systems + 7 wired RPG services +
  GM-guided story + docs reconciliation + memory-selection UI + C1 panel).
- **Release artifacts**: `docs/meta/release-process.md` + `CHANGELOG.md` ✅ (2026-08-15);
  **tag `0.1.0` (bare, no `v` prefix) deliberately NOT created — post-testing human decision**; **push pending
  (pre-push hook blocks agent — human)**.

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| `TASK-PLAN-LINT-TS-DEBT.md` | Warning remediation → `check` lint gate | ✅ closed 2026-08-14 (`lint-ts-debt` worktree) |
| `TASK-PLAN-E2E-STABILIZATION.md` | Auth redirect-loop + page-load timeouts | ✅ closed 2026-08-14 (`e2e-stabilization` worktree) |
| `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md` | Playwright coverage growth (Gate C features: tool-call blocks, GM panels, quest log) | 🟡 open |
| `TASK-PLAN-RELEASE-V010.md` | `docs/meta/release-process.md` ✅, changelog/release notes ✅ | 🟡 tag 0.1.0 deferred — post-testing human decision |
| `TASK-PLAN-SIZE-STRICT-DEBT.md` | Size-strict promotion AC | ✅ closed 2026-08-12 |
| `TASK-docs-reconcile-implementation.md` | Docs/API-reference vs `src/` audit (release-facing docs) | 🟡 open — audit; worktree merged |

## Pre-release gate (land-order, mirrors `../backlog/open.md` rows W1–W4)

1. W4 — SSE refactor committed ✅ (`082c20cf`)
2. W1 — `rpg-wire-routes` merged ✅ (2026-08-14)
3. W2 — `docs-reconcile` merged ✅ (2026-08-14)
4. W3 — push `dev` → `origin/dev` ⏳ **HUMAN** (pre-push hook blocks agent)

## Gate C remainder (must land before "happy" is true)

- ~~`TASK-gm-guided-story-creation.md`~~ — ✅ done 2026-08-14 (P2-Da); Gate C complete

## Hardening (non-blocking before tag)

- AUX M6 telemetry (`F3` in `../backlog/open.md`)
- World timeline §5.3/§5.4 (cluster B)
- Frontend gaps: music linking, party join/leave, unified GM↔assistant view, creation wizards, avatar-gallery visibility inheritance

## Definition of Done

- `bun run check` gate green ✅ (2026-08-14)
- e2e suite stable ✅ (2026-08-14)
- Gate C fully green ✅ (2026-08-14)
- Signed tag `0.1.0` + changelog + release notes — changelog ✅; **tag = post-testing human decision, not agent scope**
- `dev` pushed to `origin/dev` ⏳ HUMAN
