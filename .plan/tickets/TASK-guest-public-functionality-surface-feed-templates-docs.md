<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest public functionality surface: feed, templates, docs

**Status:** Done
**Scope:** Guest Access epic Phase 3: guest tier on the read-only public surfaces (templates shipped; feed blocked; docs verified)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-guest-access

**Summary:**

## Problem

Read-only public surfaces (proposed public story feed epic-public-feed, public templates TASK-public-templates-routes done, docs) assume an authenticated session; guests get no entry point.

## Change

- Public story feed: guest can read the feed (moderation still applies); posting/reactions stay authenticated-only.
- Public templates routes: guest can list/read templates; apply/copy stays authenticated.
- Docs: guest can browse docs.public sections (already anonymous-capable in static handler).
- Login page gains 'continue as guest' entry when auth.guestAccess=true (entry point lands in epic-frontend-login.md).

## Acceptance

- Guest reads feed and templates with no account.
- Guest cannot post, react, or apply templates.
- Login page shows guest entry only when flag on.
- Docs public sections render for guest without session.

**Context:**

The ticket's four surfaces resolve as: templates wired, docs verified already open, feed blocked on a missing epic, login entry stays with the frontend epic.

- Public templates (`src/routes/templates/crud.ts`, flat `/api/templates`): the list and retrieve GETs switched from `requireUserId` to a shared guest-open read gate — an authenticated caller passes, as does the synthetic guest tier (`userId` null + role `guest`); anonymous callers without the tier keep the canonical 401. The guest sees the built-in LLM presets only: `listTemplates` (`src/generation/template-service/crud.ts`) accepts a null user and skips the owned-rows query entirely (an unfiltered query would have returned every user's rows), and `resolveTemplateDef` (`src/generation/template-service/resolve.ts`) resolves presets only for a null user, so owner rows stay behind the account (404).
- Still authenticated-only, pinned by tests: create/patch/delete, `POST /api/templates/:id/apply` (apply/copy stays authenticated per the Change section), the transfer pack I/O (`/api/templates/export|import`), and the per-modality nested routes (`src/routes/templates/modality.ts`, mounted for video/audio) — those carry owner rows only (presets are LLM-only), so a guest read there would be vacuous.
- Docs: verified, no change needed. `handleDocsRequest` (`src/server/static-files.ts`) serves `/docs` outside the auth derive via `createNonApiHandler` and honors the `docs.public` whitelist, so the anonymous path already covers the guest tier.
- Public story feed: **out of scope / blocked** — `epic-public-feed` does not exist in `.plan/epics/` and no feed route exists to admit a guest to. Marked rather than invented; the epic's Phase 3 section records the same.
- Login "continue as guest" entry: deferred by this ticket's own text to `epic-frontend-login.md`; not attempted here.

Tests: `src/routes/templates/templates.test.ts` (new guest describe: guest lists presets only with an owned row seeded, reads a preset by id, 404 for an owned row, 401 on create/patch/delete/apply/export, 401 on the nested video/audio lists, and role-less anonymous keeps the read 401), `src/generation/template-service.test.ts` (null-user list and resolve serve presets only).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue c43700a (registry tip: 08f678ebd Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GUEST-PUBLIC-FUNCTIONALITY-)
