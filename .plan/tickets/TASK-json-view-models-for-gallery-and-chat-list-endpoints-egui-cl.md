<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: JSON view-models for gallery and chat list endpoints (egui client parity)

**Status:** Done
**Scope:** plan: reopen TASK-json-view-models ticket falsely auto-closed as Done; work is unlanded on egui-json-view-models
**Status Note:** implemented on branch `egui-json-view-models` (357d8d2dd, 473ce213a) but UNLANDED — not on `dev`. A post-merge reconciliation commit (07ea4d69d) auto-closed git issue 0852403 and appended a false close marker to this file; reopened 2026-10-16 and that marker was removed. Landing that branch is a separate decision.
**Priority:** high
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Summary:**

Finish the JSON branch of the content negotiation so the egui client consumes
the same view-models the templates bind to.

Today (htmx): the 3-way decision exists — src/routes/views/negotiate.ts
(wantsJsonViewModel, :29-46, Accept-header q-value comparison) plus the 2-way
HX-Request branch in src/routes/views/layout.ts:253-274 — but only ONE route
applies it: GET /dynamic/characters/grid (src/routes/views/plugin-dynamic.ts:28,
:34-35). The gallery grid/search (:42, :69) and chats list/search (:112, :123)
still return HTML only, so an egui client has to scrape fragments — the exact
anti-pattern the epic's option (c) was chosen to avoid.

Target: extend wantsJsonViewModel to the gallery and chat-list dynamic
endpoints, returning the same projected rows the templates render, with the
HX-Request path byte-identical to today.

**Context:**

Parity target #1 of the egui roadmap in `epic-experimental-egui-frontend.md`
(2026-10-16) and the server-side base every other parity target sits on: the
egui client can only reach a surface that speaks JSON. Content negotiation
already exists — `src/routes/views/negotiate.ts` (`wantsJsonViewModel`, JSON +
collaborator callbacks at the router level) and it is wired at
`/dynamic/characters/grid` only; the gallery endpoints
(`src/routes/dynamic/gallery.ts`) and the chats endpoints
(`src/routes/dynamic/chats.ts`) are still HTML-only. Extending the existing
operator is the smallest change that gives the egui client the gallery and chat
list without a second API family. Constraint from the epic's acceptance
criteria: the `text/html` + `HX-Request` paths must stay byte-identical, so the
JSON branch is additive and the golden-markup snapshots are the guard.

**Acceptance Criteria:**

- [ ] `GET /dynamic/gallery/grid`, `/dynamic/gallery/search`,
      `/dynamic/chats/list` and `/dynamic/chats/search` return
      `application/json` when `Accept` prefers it, and byte-identical HTML
      otherwise (`HX-Request` and full-page modes unchanged)
- [ ] The JSON payload for a gallery grid contains the fields the htmx template
      binds (asset id, thumb URL, tags, visibility state, timestamps)
- [ ] A parity test asserts html-mode and json-mode describe the same rows for a
      seeded fixture, and a golden-markup test pins the htmx response
- [ ] openapi/spec surfaces updated if the dynamic endpoints are documented

**Resolved:** 2026-10-18 registry-driven close: git issue 0852403 (registry tip: 5cab337b2 Konstantin Fedotov Close issue)
