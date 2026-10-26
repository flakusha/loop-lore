<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete unreachable view partials, orphan partial and dead CSS blocks

**Status:** Not Started
**Status Note:** [2026-10-26] EVIDENCE SOURCE GONE: this ticket cites `.tmp/simplification/*.md`, deleted by a .tmp cleanup on 2026-10-12 and never git-tracked (verified unrecoverable — see BUG-simplification-audit-artifacts-lost-to-a-tmp-cleanup-13-tick / dd8e139). Every count, finding number, or ranking taken from those citations is UNSOURCED; re-derive against the current tree before acting. The ticket's substance (file:line scope lists, MUST RETAIN lists, re-derive commands) stands on its own; only the audit citations dangle.
**Priority:** medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

Remove the three Go-era templates under src/views/partials, the orphan load-more partial, and the dead gallery/app/vn/keynav/theme-no-icons CSS blocks. Research: the frontend slice of the over-engineering audit (scratch, not on disk).

**Context:**

Four templates are unreachable through either resolution path, one partial has no include site, and
several CSS class families have no markup reference. knip is not evidence here — it does not analyse
CSS or locale JSON, and it does not resolve `from "./foo.js"` → `foo.ts`. Source:
the frontend slice of the over-engineering audit (scratch, not on disk). Recompute class reachability with the documented grep in each bullet
before cutting.

**Scope — templates:**

- `src/views/partials/planning-todo.html:1-34`
- `src/views/partials/character-journey.html:1-39`
- `src/views/partials/character-growth-editor.html:1-120`
- `src/components/load-more.html:1-40`

**Scope — dead CSS:**

- `src/public/css/gallery.css:21-173` (`gallery-content`, `gallery-slide`, `gallery-nav`,
  `gallery-fullscreen-btn`, `gallery-thumbnails`, `gallery-thumbnail`, `gallery-info`),
  `229-241` (`asset-badge`), `243-266` (`gallery-upload-area`) — the legacy lightbox stylesheet; the
  gallery view uses an htmx `hx-get` grid plus the `asset-preview-modal` partial. Once these go the
  file is nearly empty and can be deleted outright.
- `src/public/css/app.css` — `109` (`.theme-option:hover`), `886-887` + `915-925`
  (`.thinking-indicator`), `1087-1108` (`.dropdown-stat`, `.stat-label`, `.dropdown-stat-no-data`,
  `.action-dropdown-info`), `1344-1346` (`.detail-item`), `2029-2040` (`.protip`),
  `2578-2609` (`.skeleton`, `.skeleton-card`, `.skeleton-line`), `2611-2626` (`.chat-input-bar`
  container query, `.tool-secondary`, `.tool-tertiary`), `3503-3520` (`.theme-selector`,
  `.theme-options`).
- `src/public/css/vn.css:267-272` (`.vn-choices-list`), `291-299` (`.vn-choice-label`,
  `.vn-choice-description`), `302-330` (`.vn-choice-history` family), `520-543`
  (`.participant-panel` family).
- `src/public/css/mobile-keynav.css:16-20` (`.mobile-composer__form`),
  `src/public/css/theme-no-icons.css:64` (`.decorative-icon`).

**Evidence:**

- Executed against the real discovery module: importing `discoverViews()`
  (`src/routes/views/constants.ts:20-32`) and `discoverPartials()` (same file, `39-59`) yields
  `view:false partial:false` for `planning-todo`, `character-journey` and `character-growth-editor`
  (and `partials/character-journey` → `false`). `discoverViews()` adds only *files* directly under
  `src/views`, skipping subdirectories; `discoverPartials()` walks only `src/partials` and
  `src/components`. Corroborating: `grep -rn "\{\{> *(planning-todo|character-journey|character-growth-editor|load-more)" src/ docs/`
  → no matches.
- `load-more.html`: executed against the real Elysia app — `/partials/load-more` → **404 NOT_FOUND**
  while the control `/partials/characters/create-modal` → 200. `ALLOWED_PARTIALS.has("load-more")` is
  **true**, so allowlist membership alone does NOT prove reachability: the route shape
  `/partials/:page/:section` (`src/routes/views/plugin-static.ts:14`) cannot match a one-segment
  name. The 404 is the evidence.
- CSS: `grep -rn "gallery-nav|gallery-slide|gallery-info|gallery-content|gallery-thumbnails|gallery-upload-area|asset-badge" src/views src/partials src/components src/frontend src/routes`
  → zero hits outside `gallery.css`. Same method for the `app.css` / `vn.css` / keynav / no-icons
  families.

**Caveats / constraints:**

- Do NOT delete the 25 top-level view skeletons or the 9 `src/partials/**` files — those are real
  routes / htmx partials (`/partials/…` pulled by `hx-get` from `src/views/characters.html:11,21,31`
  and friends). Reachability caveat applies to them only; it does NOT apply to the three files under
  `src/views/partials/`.
- Keep the live look-alikes: `.input-toolbar` (`src/components/chat/input-area.html:464`),
  `.action-dropdown` (`src/components/chat/message-list.html:561`), `.role-badge`
  (`src/views/admin.html:249` — verified live, deliberately excluded), and the template-literal-built
  VN classes `vn-choice-card…` (`src/frontend/vn/choice-cards-render.ts:43`) and `vn-slot-…`
  (`src/frontend/vn/sprite-stage.ts:194`).
- The duplicated live renderers must be verified, not assumed: `src/frontend/pages/characters-journey.ts:62-70`
  (wired at `characters.ts:259`, covered by `characters-journey.test.ts:113`) and
  `src/routes/views/character-growth-section.ts:75-101` (wired at `character-edit-form.ts:16`,
  covered by `characters.test.ts:160` and `character-growth-section.test.ts:37`).
- CSS deletion is accessibility-sensitive by default: the frontend audit explicitly did NOT touch
  `aria-*`, `<label for>`, `role="dialog"`, `aria-live` or focus handling. Keep it that way — if a
  deleted selector turns out to carry a focus or hover affordance, keep the rule.
- If `src/public/css/gallery.css` ends up empty, delete the file and its `@import`/link reference
  rather than leaving a stub.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
