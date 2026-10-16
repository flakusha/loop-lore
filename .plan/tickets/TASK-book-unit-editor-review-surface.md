<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Book Unit Editor + Regenerate/Pin/Accept Review Surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-artifact-schema.md`, `TASK-book-outline-generation-workflow.md`, `TASK-publication-artifact-versioning.md`, `TASK-publication-viewer-read-mode.md`, `epic-assistant-creative-studio-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The review loop for the text-only book tier: an editor surface over ordered
chapters with per-unit regenerate, pin, accept, and reject. This is the surface
a generation run is meant to end at — without it the workflow produces text
nobody can correct.

## Context

The frontend contract in this repo is htmx for server-rendered fragments plus
Alpine for local state, and this ticket follows both without exception:

- Full-page shells live in `src/views/*.html` (e.g. `worlds.html`,
  `gallery.html`) and are served from `src/routes/views/`.
- Server-rendered fragments are served under `/dynamic/*` from
  `src/routes/views/plugin-dynamic.ts`, and **redirect to `/views/` when the
  request lacks `HX-Request`** — every new fragment endpoint must keep that
  guard.
- Views call Alpine factories from `src/frontend/alpine/*.ts`; page-level stores live in
  `src/frontend/pages/*.ts`. The timeline store that uses `htmx.ajax` is
  `src/frontend/pages/world-timeline-bar.ts:90` — a **page** store, not
  `src/frontend/alpine/world-timeline-bar.ts` (that file does not exist). And `htmx` there is a
  **global**, not an import: `src/frontend/alpine/htmx.ts` exports only `apiFetch` (`:30`), so
  `htmx.ajax(...)` in a page store relies on the global the page shell installs. Copy that
  pattern; do not add an `htmx` import that does not exist.

Actions map onto the two columns the schema ticket writes — do not invent a
single `state` column. Both vocabularies already exist and carry transition
guards:

| Action | Effect on the unit row |
| ------ | ---------------------- |
| edit | `body` updated in place |
| pin | `pin = PinnedState.Pinned` (`src/db/enums-core/flags.ts:8`) — excluded from regeneration sweeps |
| accept | `publication_status = PublicationStatus.Published` (`src/db/enums-story/items.ts:45`) |
| submit for review | `publication_status = PublicationStatus.Review` |
| reject | `publication_status = PublicationStatus.Rejected` — kept for history, excluded from export; the machine permits `rejected → draft` only |
| regenerate | new `body` from the workflow dispatch for that one unit only |

Every status change goes through `publicationStatusMachine`
(`src/db/enums-story/items.ts:68`) so an illegal edge (e.g. `archived → draft`) is
rejected rather than written. "Accepted" in the UI is `Published` in the enum —
use the enum's word in code and the user's word in the button label.

Regenerate is per unit, not per artifact: the dispatch carries the unit id and
the runner is re-entered for a single step, so a rejected third chapter does
not cost the whole book. Keep/discard of the previous body is the versioning
ticket's job (`TASK-publication-artifact-versioning.md`); this ticket writes the
current body and flags the unit, it does not build a revision store.

**There is no workflow step UI or confirmation modal to reuse.**
`src/frontend/creative-studio/workflow.ts` appears in the `epic-creative-studio.md`
task table as a proposed `new` file and does **not** exist in `src/`. The existing
command surface it would have served is `src/assistant/commands/workflow.ts`.
So this ticket either (a) renders regenerate confirmation inline in the editor
with the `publication_status = Review` step above, or (b) blocks on that separate
frontend ticket. Prefer (a): do not build a second confirmation modal, and do not
assume the creative-studio file is there.

## Acceptance Criteria

- [ ] A book editor shell exists at `src/views/publication-book.html`, served from
      `src/routes/views/`, listing the publication's units in `position` order
- [ ] Unit fragments are served from `/dynamic/publications/:id/units` (and a
      per-unit `/dynamic/publications/:id/units/:unitId`) by
      `src/routes/views/plugin-dynamic.ts`, each returning a 302 to `/views/`
      when `HX-Request` is absent
- [ ] Each unit renders its `publication_status` (the enum's value, labelled with the user's word — never a column named `state`, see ## Context) plus its `pin` value, and exposes pin / accept / reject / regenerate controls wired to `hx-post` against the publication routes
- [ ] An Alpine store (e.g. `src/frontend/alpine/publication-book-editor.ts`)
      holds selection + dirty state and is registered in `src/frontend/alpine/index.ts`
- [ ] Regenerate posts to a route that re-enters the workflow for **one** unit id
      and writes back only that unit's body; sibling unit positions and bodies
      are untouched (covered by a route test)
- [ ] A pinned unit is skipped by regeneration sweeps — pinned survives a
      full-artifact regenerate request
- [ ] Owner authorization is enforced on every unit read and write; a
      non-owner's request is rejected, not silently empty (covered by a route test)
- [ ] Escape-by-default on user prose: unit text renders through the existing
      HTML escaping helper (`src/routes/views/escape-html.ts`), never raw
- [ ] Frontend tests cover pin/accept/reject state transitions and the
      non-`HX-Request` redirect for the new fragment endpoints