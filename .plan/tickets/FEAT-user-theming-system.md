<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: User theming system (custom themes, import/export, live switching)

**Status:** Not Started
**Summary:** User-facing theming: token-override themes with CRUD, import/export, live switching.
**Context:** ST theme JSON + generator (`src/endpoints/themes.js`, `ThemeGenerator.js`); Odysseus `static/js/theme.js`. Loop-lore has 12 static CSS files only; searches `theme generator|custom theme|theme editor|user theme`: 0 matches (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Create/edit/switch a theme live; persists across sessions
- [ ] Malicious import JSON rejected (unknown keys, script in names)
- [ ] Bundled themes still pass CSS token gates
**Epic:** epic-frontend-settings.md
**Type:** Feature | **Priority:** Medium | **Effort:** M

## Problem

Loop-lore ships 12 static CSS theme files only (`src/public/css/*.css`, epic-architecture L71); users cannot create, customize, import, or export themes. Both references treat theming as a first-class user surface:

- SillyTavern: theme JSON entities with import/export, 5 bundled themes, and a **theme generator** — `src/endpoints/themes.js`, `public/scripts/util/ThemeGenerator.js`, `default/content/index.json`.
- Odysseus: theme presets, custom colors/fonts/backgrounds, live switching — `static/js/theme.js`.

Searches `theme generator|theme import|custom theme|theme editor|user theme|theme creator` across `.plan/`, `docs/`, `src/` return zero matches (verified 2026-09-21 reference-platform gap audit).

## Change

- Theme = token overrides (colors, fonts, radii, density) on top of the existing CSS custom-property system (canonical tokens per `theme-base.css`); no CSS-in-JS (banned pattern).
- Theme CRUD: duplicate a bundled theme → edit tokens → save per user; live preview; reset.
- Import/export as JSON; validate + sanitize on import (names/strings only, no URLs, no raw CSS).
- Server-rendered pages pick the active theme via existing locale-cookie-like mechanism; no flash-of-wrong-theme on load.

## Acceptance

- Create/edit/switch a theme without page reload; persists across sessions.
- Imported malicious JSON (script in name, unknown keys) rejected.
- All bundled themes still pass the CSS token gates (`BUG-undefined-css-custom-properties-break-rendering` precedent).

## Non-goals

- Fully arbitrary custom CSS injection (security surface); per-chat backgrounds (shipped).
