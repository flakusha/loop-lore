<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-editor-structured-fields-ui

**Status**: open
**Priority**: high
**Labels**: frontend, character-editor, ux, alpine, htmx
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `src/frontend/pages/characters-edit-form.ts`, `src/routes/views/character-edit-form.ts`, `docs/spec/character-spec.md` §5

## Description

The current character edit form (`/character/:id/edit`) is a flat HTML form
with 8 text fields (name, description, personality, scenario, welcome message,
mes example, system prompt, post-history instructions) plus avatar upload and
content rating. This is the **raw** editor — all free-text, no structured
field support.

The character spec defines 20+ fields across mandatory, optional, NSFW, and
extensions categories. The UI needs to surface all of them in a navigable,
validated form.

### Current State

- `serveCharacterEditForm` renders: name, description, system prompt, personality, greeting, scenario, example dialogue, post-history instructions, content rating (5-tier dropdown)
- `saveCharacterEdit` serializes these fields to `ActorUpdateBody` via `jsonBody()`
- Internal traits saved via `globalThis.saveAllTraits()` (parallel call)
- Proactive messaging config saved via `globalThis.saveProactiveConfig()`
- No structured fields: no permanent traits, no world/location traits, no mood, no NSFW traits, no extensions

### Acceptance Criteria

- [ ] Character edit form has tabbed navigation: Basic Info | Traits | NSFW | Extensions | Review
- [ ] **Basic Info tab**: existing 8 fields + content rating + avatar
- [ ] **Traits tab**: permanent traits editor (category selector + key/value pairs), world/location traits (per world/location), internal traits (aspirations, moral, approach, voice) with visibility toggles
- [ ] **NSFW tab**: content rating + NSFW categories + hard limits + 7 NSFW trait tables (intimacy, arousal, desire, skills, body, fantasies, heat cycle) — gated by content rating
- [ ] **Extensions tab**: JSON textarea for raw `extensions` blob + structured sub-editors for known extensions (stats, inventory)
- [ ] **Review tab**: validation errors summary, review status, submit for review button
- [ ] Alpine.js reactive form with dirty-tracking and unsaved-changes warning
- [ ] htmx partials for each tab (progressive enhancement)
- [ ] Tabs remember scroll position and active tab on save
- [ ] Responsive layout (grid on desktop, stack on mobile)
- [ ] Unit test: form serialization, tab navigation, field visibility gating

### Notes

- Use Alpine.js `x-show`/`x-if` for tab switching — no full page reloads
- Server-rendered initial state with Alpine hydration (same pattern as character grid)
- Permanent traits use `trait_category` enum for category dropdown
- NSFW tab hidden when `content_rating === "sfw"` — shown with unlock confirmation otherwise
- Visibility toggles (`visible | hidden`) for internal traits per epic-character-internal-traits.md D5
- Two view tiers: player-facing (visible only) vs author/GM (all fields) per D6
