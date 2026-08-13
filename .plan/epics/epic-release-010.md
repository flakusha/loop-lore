# EPIC: Release 0.1.0

**Status:** 🟡 In Progress (Gate C core shipped 2026-08-12)
**Priority:** High
**Effort:** Medium
**Type:** Release Epic
**Tags:** release, 0.1.0, gate, hardening, tag, changelog

## Summary

Consolidate the "Road to Happy 0.1.0" workstack (previously scattered across
`../backlog/priority.md` "Open → close" + "Hardening" + `../backlog/open.md` § Release
hardening) into one tracked epic so a single agent can drive the release. `package.json`
already declares `version: 0.1.0`.

## Current State (verified 2026-08-12/13)

- **Gate C core** ✅ shipped + verified on `dev`: VN, chat, assistant + tool-call UI,
  GM panels + quest log, auth/access incl. world/location, gallery.
- **Gate C remainder**: GM-guided story (P2-Da, `TASK-gm-guided-story-creation.md`) greenfield.
- `bun run check` 16/17 — **one red gate left: lint-ts** (~196 warnings / 291 files);
  size-strict closed 2026-08-12 (0 files over 250L).
- e2e browser suite ~51/85 — auth redirect-loop + page-load timeouts.
- `dev` is 19 commits ahead of `origin/dev` (unreleased; Gate C + new epics).
- Worktrees pending merge: `rpg-wire-routes` (13 commits, items backend), `docs-reconcile`
  (uncommitted docs work). SSE refactor uncommitted on `dev`.

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| `TASK-PLAN-LINT-TS-DEBT.md` | Warning remediation → `check` 17/17 (last red gate) | 🟡 open |
| `TASK-PLAN-E2E-STABILIZATION.md` | Auth redirect-loop + page-load timeouts; ~51/85 → stable | 🟡 open |
| `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md` | Playwright coverage growth (Gate C features: tool-call blocks, GM panels, quest log) | 🟡 open |
| `TASK-PLAN-RELEASE-V010.md` | `docs/meta/release-process.md`, signed tag `v0.1.0`, changelog/release notes | 🟡 open |
| `TASK-PLAN-SIZE-STRICT-DEBT.md` | Size-strict promotion AC | ✅ closed 2026-08-12 |
| `TASK-docs-reconcile-implementation.md` | Docs/API-reference vs `src/` audit (release-facing docs) | 🟡 open (worktree `docs-reconcile`) |

## Pre-release gate (land-order, mirrors `../backlog/open.md` rows W1–W4)

1. W4 — commit `dev` uncommitted work (SSE refactor `sse-utils.ts`, check-md-links tweaks, character-internal-traits epic edit)
2. W1 — finalize `rpg-wire-routes` (commit 3 plan files, rebase 14 dev commits, merge)
3. W2 — finalize `docs-reconcile` (commit docs work, finish reconcile audit, merge)
4. W3 — push `dev` → `origin/dev`

## Gate C remainder (must land before "happy" is true)

- `TASK-gm-guided-story-creation.md` — participant type, `/guide` command, guidance panel, turn-order wiring (P2-Da)

## Hardening (non-blocking before tag)

- AUX M6 telemetry (`F3` in `../backlog/open.md`)
- World timeline §5.3/§5.4 (cluster B)
- Frontend gaps: music linking, party join/leave, unified GM↔assistant view, creation wizards, avatar-gallery visibility inheritance

## Definition of Done

- `bun run check` 17/17 green
- e2e suite stable (no auth redirect-loop, timeouts fixed)
- Gate C fully green (incl. GM-guided story)
- Signed tag `v0.1.0` + changelog + release notes
- `dev` pushed to `origin/dev`
