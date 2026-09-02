<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Wardrobe / Loadout Avatar Variants

**Status:** 🔴 Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** avatar, wardrobe, outfit, loadout, emotion, variants, selection

## Summary

Characters/NPCs carry **multiple visual variants beyond emotion** — clothes,
outfits, loadouts — and the rendered avatar becomes a **hybrid resolution**:
`visual = f(emotion, wardrobe, context)` where emotion reflects *current
state* (per-message, already implemented direction) and wardrobe reflects
*situational appearance* bound to world/location/chat/equipped items.

## Motivation

Emotion-only variants pin a character to one outfit forever; stories move
characters between contexts (dungeon armor ↔ court dress ↔ sleepwear) and the
visual should follow without breaking identity consistency. The existing
avatar-selection design (`TASK-character-multi-avatar.md`) already plans
context-aware selection (mood/chat/world) but has **no wardrobe dimension**:
no outfit entities, no outfit×emotion variant matrix, no context→outfit
binding rules. This epic extends that selection algorithm rather than
competing with it.

## Current State

- Selection: `src/characters/services/avatar-service/` +
  `POST /actors/:actorId/avatars/select`, config via
  `PUT .../avatars/config`; `TASK-character-multi-avatar.md`
  defines the schema and selection-rules design (avatar contexts incl. world
  config) — not yet landed as wardrobe.
- Emotion generation: `emotion-avatar-service` generates per-`EmotionType` only;
  prompts assembled from emotion entries in config templates — no outfit
  descriptor slot.
- RPG adjacency: inventory/items exist (`src/rpg/`, `epic-inventory-ui.md`) but
  items carry no avatar/visual linkage.

## Architecture

- **Variant key:** avatar rows gain a second dimension —
  `emotion (existing enum) × outfit_id (new, nullable; null = base/default
  outfit)`. Selection algorithm resolves:
  1. **outfit** ← context binding: explicit chat/scene override → location/world
     rule → equipped-loadout mapping → character default outfit
  2. **emotion** ← per-message `messages.emotion` (binding epic) → mood fallback
  3. **fallback ladder** (per `TASK-character-multi-avatar` rules): exact
     (outfit,emotion) → (outfit,neutral) → (default,emotion) → base avatar
- **Wardrobe entities:** `wardrobe_items` (id, actor/world scope, name,
  descriptor prompt fragment, tags e.g. `formal|armor|sleepwear|swim`,
  optional linked inventory item id) + `actor_wardrobe` (owns) +
  `chat_wardrobe_overrides` / location binding rules (world-level config
  table or JSON in existing world avatar config — follow
  `TASK-character-multi-avatar` storage choice when it lands).
- **Generation:** variant job = prompt composition
  `identity-anchor + outfit-descriptor + emotion-descriptor`; batch =
  emotion × selected outfit. Identity consistency strategy: edit-model
  img2img from base avatar where stable (`TASK-emotions-avatar-edit-model`
  fallback ladder), else seed-locked txt2img with descriptor templates.
- **Loadout bridge (later phase):** map equipped RPG items → outfit descriptor
  (equip plate → armor look); keep decoupled from inventory initially — manual
  outfit switch first, equip-driven automatic switch behind a flag.

## Work Items

- [ ] **Schema** — `wardrobe_items`, `actor_wardrobe`, avatar-row `outfit_id` column
      (+ binding-rules storage per multi-avatar design); regen generated schema
      → `TASK-wardrobe-schema-wardrobe-items-actor-wardrobe-avatar-outfit-.md`
- [ ] **Selection algorithm v2** — (outfit, emotion) resolution with
      fallback ladder; context overrides (chat > location > default)
      → `TASK-wardrobe-selection-algorithm-v2-outfit-emotion-resolution-la.md`
- [ ] **Outfit-scoped generation** — batch/single jobs (prompt composition slot);
      integrates `epic-avatar-regeneration-control.md` scope params
      → `TASK-wardrobe-outfit-scoped-avatar-generation-batch-single.md`
- [ ] **Routes + validation** — wardrobe CRUD, per-outfit avatar generate/regenerate,
      chat/scene outfit override endpoints (ownership-checked)
      → `TASK-wardrobe-routes-validation-crud-outfit-override-endpoints.md`
- [ ] **UI** — wardrobe manager on character sheet; outfit switcher in chat header;
      variant grid grouped by outfit × emotion
      → `TASK-wardrobe-frontend-manager-on-character-sheet-outfit-switcher.md`
- [ ] **Story/GM integration** — narration hook — outfit change events visible to
      prompt context (`src/assistant/prompt/sections/emotion-avatar.ts` analog
      or extension); refuse/block interaction note: wardrobe change of the
      *player* actor routes through the immersion gate
      (`epic-immersion-consistency-gate.md`)
      → `TASK-wardrobe-story-gm-integration-outfit-change-events.md`
- [ ] **Tests** — fallback ladder order, override precedence, outfit-scoped regen
      isolation (emotion re-roll doesn't cross outfits), migration/schema-sync
      → `TASK-wardrobe-tests-fallback-ladder-override-precedence-outfit-sc.md`
- [ ] **Deferred phase** — equipped-items → outfit auto-mapping (flag-gated)
      → `TASK-wardrobe-deferred-equipped-items-outfit-auto-mapping-flag-ga.md`

## Non-Goals

- Per-pose/skeletal variation; outfit physics.
- Item-level appearance compositing (layered garment rendering) — whole-outfit
  variants only.
- Cross-character outfit sharing beyond world-scope template items.

## Acceptance Criteria

- Same actor renders different (outfit, emotion) combos across two chats in
  different locations without manual per-message choice
- Existing emotion-only characters keep working (null outfit = today's
  behavior) — zero-migration surprise
- Selection is deterministic + documented ladder; unit tests pin precedence
- Regeneration respects outfit scope (re-roll angry-in-armor ≠ touching
  angry-in-court-dress)

## Related

- `TASK-character-multi-avatar.md` — parent selection design this epic extends
  (wardrobe dimension + fallback ladder live there first)
- `epic-emotion-avatar-message-binding.md` — emotion axis of the hybrid key
- `epic-avatar-regeneration-control.md` — regen becomes (emotions × outfit) scoped
- `epic-asset-transform-metadata.md` — new outfits get per-context framing edits
- `epic-avatar-alpha-vn-layering.md` — outfit sprites share alpha pipeline
- `epic-inventory-ui.md` / `src/rpg/` — future equipped-loadout bridge
- `epic-immersion-consistency-gate.md` — actor state vs appearance-change gating
