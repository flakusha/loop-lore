<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Age Gate & Content Warnings

**Effort:** Medium
**Type:** epic
**Tags:** frontend, security, privacy
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Reopened 2026-10-23 — open post-completion tickets attached during epic-attachment triage.
**Status Note:** Reconciled 2026-10-19. This file previously read `Not Started` with TBD Scope and Tickets placeholders, papering over a subsystem that had already shipped end to end. Settled by reading the shipped files rather than by inference; `0fa6e8618` closed the last gap, the screen. The backend predates this branch and is credited, not claimed by this epic. The `Content Warnings` half of this title has no implementation and no spec anywhere — content gating belongs to the NSFW gate subsystem, which this epic depends on rather than builds — so treat it as historical naming, not an outstanding deliverable.
**Priority:** Medium

## Summary

Frontend implementation for Age Gate & Content Warnings. See `docs/frontend/age-gate.md` for UX specification.

## Scope

The age-gate feature end to end: a self-declaration birth-date verification screen, the app-wide client guard that routes ungated users onto it, and the server-side subsystem that both rest on.

**Server.** A config section (`src/config/sections/age-gate.ts`) carrying `enabled` / `minimumAge` / `mode`, reachable from the environment via `AGE_GATE_ENABLED` / `AGE_GATE_MINIMUM_AGE` / `AGE_GATE_MODE` and hot-reloadable without a restart. Two nullable columns on `users` — `birth_date` and `age_gate_accepted_at` — hold the declared date and the acceptance timestamp, and both stay NULL while the gate is disabled. A service (`src/age-gate/service.ts`) answers status for a user record and validates and persists an acceptance; a controller (`src/age-gate/controller.ts`) exposes it over HTTP and seeds runtime config at server start. Enforcement is server-side and authoritative: the NSFW gate denies a user who has not accepted (`src/middleware/nsfw-gate/base-eval.ts`) and chat creation refuses outright.

**Client.** A single htmx view, `src/views/age-gate.html`, reached by auto-discovery — dropping the file into `src/views/` registers it, no registry edit required. Its Alpine state lives in `src/frontend/alpine/age-gate.ts` alongside `enforceAgeGate()`, the app-wide guard invoked from `app().init()`; hooking there rather than per-page is what makes the guard cover every layout-wrapped load, including htmx-swapped content. The guard converges in at most one redirect per load (its own target is exempt, so it cannot bounce itself) and fails OPEN when the status call errors, because the server re-validates on every gated action and a client-side failure must never strand a user. Strings render from the locale catalog rather than from the server response, since the fetch layer rejects on non-2xx and never surfaces the body.

**Out of scope.** Content warnings. This epic's title names them, but nothing in the epic body or in `docs/frontend/` specifies them; content gating is the NSFW gate subsystem's job, and that subsystem is a dependency of this work rather than part of it.

## Related Epics

- `docs/frontend/age-gate.md`

## Tickets

No implementation ticket set exists — the build and the frontend both landed without one, and none was fabricated retroactively. The scope is reconstructable from the shipped commits and files.

**Planning ticket.** `TASK-reconcile-epic-frontend-age-gate-verify-age-gate-frontend-ca.md` — the only ticket bound to this epic (`**Epic:** epic-frontend-age-gate`). It exists to reconcile this epic's status against the shipped code; this file is its output.

**Shipped by commit.**

- `ccef9f595` — `docs(plan): record the epic priority and plan-drift analysis`
- `0fa6e8618` — `feat(frontend): ship the age-gate screen and the app-wide guard`. Delivers `src/views/age-gate.html`; `src/frontend/alpine/age-gate.ts` (the `ageGate()` component and the exported `enforceAgeGate()` guard); the `enforceAgeGate()` call from `app().init()` in `src/frontend/alpine/app.ts`; the barrel import in `src/frontend/alpine/index.ts`; the `ageGate.*` key set across every locale catalog under `src/public/locales/`; and the tests `src/frontend/alpine/age-gate.test.ts`, `src/frontend/alpine/age-gate-guard.test.ts`, `src/frontend/alpine/age-gate-interpolation.test.ts`, `src/routes/views/age-gate.test.ts`, `tests/e2e/flows/browser/age-gate-guard.browser.ts`.

**Shipped before this branch** (backend; credited, not claimed here) — `src/age-gate/service.ts`, `src/age-gate/controller.ts` and their test files; the `users.birth_date` / `users.age_gate_accepted_at` columns; the `ageGate` config section with its env bindings and hot-reload path; the route mount and start-time config seed.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Login & Authentication UI | Entry flow | Age verification ordering |
| NSFW Gate middleware | Content gating | `src/middleware/nsfw-gate/index.ts` |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Login & Authentication UI | Verification result | Gate the session |
| Frontend Settings | Preference | Age/content-warning prefs |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Age-gate service (`src/age-gate/service.ts`) | Login, NSFW gate | Verification state |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered verification page |

**Resolved:** 2026-10-19 registry-driven close: git issue c38ad66 (registry tip: 375d430f5 Konstantin Fedotov Auto-closed: appended .md marker marks EPIC-FRONTEND-AGE-GATE done)
