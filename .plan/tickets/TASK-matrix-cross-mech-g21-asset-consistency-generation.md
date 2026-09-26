<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g21: Asset-consistency generation (reference conditioning + in-chat edit)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** Keep a character or scene's look stable across generated images via reference conditioning. Add an in-chat asset-edit flow that re-uses prior outputs as conditioning inputs. Touches CharCore, Exploration, Narrative, Housing, Weather.
**Context:** `matrix-cross-mechanics.md` G21 is 🟢 Low (severity) but the matrix calls it "Med difficulty, do not defer — clean pull candidate". Inspiration: Luma, Runway, Krea, RisuAI dynamic-assets. Reference conditioning is the cheapest path to character/scene consistency; in-chat edit unlocks iterative storytelling without regenerating from scratch.

## Current state

- Image generation (`src/assets/`) calls providers with text prompts; no reference image conditioning.
- `characters.avatar_id` anchors one image but doesn't carry through to scene-level generations.
- In-chat asset edits don't exist — every "change X's shirt" request regenerates without context.

**Acceptance Criteria:**

- [ ] Generation pipeline accepts a `reference_assets: AssetId[]` parameter; provider adapter passes it through (only adapters that support reference conditioning actually use it; others ignore without failing).
- [ ] Character-anchored scenes auto-include the character's `avatar_id` as a reference when the provider supports it.
- [ ] In-chat edit intent (`/edit-asset` or detected) takes the most recent asset in the chat as a reference and passes the user's delta as text.
- [ ] Tests: reference-passing path (provider-agnostic contract test), in-chat edit round-trip.
- [ ] `bun run check` green.

**Tags:** assets, generation, consistency, reference-conditioning, in-chat-edit, low-severity
**Related:** src/assets/, src/actors/, src/exploration/, src/narrative/, .plan/matrix-cross-mechanics.md (G21 row)

git issue: 33878b5
