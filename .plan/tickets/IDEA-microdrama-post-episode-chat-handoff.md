<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Post-episode character chat handoff (microdrama pattern)

**Status:** Deferred — re-evaluate after story-mode and VN surface land
**Priority:** Low | **Effort:** S (decision + sketch only)
**Summary:** Scripted short-form episodes (microdramas) that hand off to live character chat when the episode ends — the viewer continues inside the fiction with the episode's characters.
**Context:** Character.AI launched (c.ai) Series in Jul 2026 (in-house vertical microdramas on platform-native characters; post-episode chat corroborated by TechCrunch/Forbes/Variety). Product-direction call needed before any build: this crosses loop-lore's chat/RPG core into scripted linear content (blog + VN + story epics are the adjacent surfaces). Swept 2026-09-21 (`docs/ideas/emergent-platform-landscape-2026c.md`, Bucket F).
**Acceptance Criteria:**
- [x] Product decision recorded: adopt (which surface — blog/VN/story), defer, or reject, with rationale
- [x] If adopt: episode→chat handoff contract sketched (episode end-state → live chat seed with character states + viewer identity)

## Summary

Scripted short-form episodes (microdramas) that hand off to live character chat when the episode ends — the viewer continues inside the fiction with the episode's characters.

## Resolution (2026-10-01)

**Decision: Defer.**

### Rationale

Post-episode chat handoff (c.ai Series pattern) is a coherent product concept. The Character.AI precedent (Jul 2026) confirms user demand for continuing inside the fiction after scripted content. However, loop-lore's three adjacent surfaces — blog system (`epic-blog-system.md`), visual novel (`epic-visual-novel-mode.md`), and story mode (`epic-story-mode-ui.md`) — are at different maturity levels, and the handoff contract is non-trivial:

1. **Surface maturity mismatch.** The blog system is a static/published-content surface. The VN mode is a linear branching narrative. Neither has been evaluated as a scripted-episode host. Building the handoff against an immature surface is a high-risk bet.

2. **The handoff contract problem.** The episode→chat handoff requires:
   - **Episode end-state** (character states, world state delta, viewer relationship to characters) serialised as a structured seed.
   - **Viewer identity** preserved from episode context into live chat — the viewer is not a player of the episode; they are a spectator who becomes a participant. This is a distinct identity model.
   - **Character-state injection** — the NPC being handed off must load the episode's character-arc state into BDI/memory without retconning it.
   This contract has no implementation today and depends on `epic-npc-bdi-autonomy.md` (BDI state) and `epic-memory-knowledge-systems.md` (episodic memory for character backstory).

3. **Scoping the right surface.** If this pattern is built, VN is the most natural host — episodes are linear, character-driven, and the VN surface already has a notion of "story progress". The blog system is the wrong surface (too static, no character-state concept). Story mode is plausible but still early.

4. **Landscape alignment.** Bucket F of `emergent-platform-landscape-2026c.md` (swept 2026-09-21) names post-episode character chat as a genuine gap filed from this sweep. The verdict here is consistent: the gap is real, but loop-lore's prerequisite surfaces are not yet ready to host it.

### Re-evaluation trigger

Revisit when:
- `epic-visual-novel-mode.md` has shipped at least one complete episode authoring + playback cycle, AND
- `epic-npc-bdi-autonomy.md` or its memory prerequisites are in progress.

### If adopt (future): sketch episode→chat handoff contract

```
Episode end-state  →  Live chat seed
────────────────────────────────────────────────────────
episode_id, viewer_id, character_ids[]

character_states[character_id] =
  current_world_location: LocationId
  relationship_to_viewer: RelationshipId  (post-episode delta)
  memory_context: EpisodeMemory[]          (key events from episode)
  bdi_state: { current_intention, mood_pad, active_goals[] }

viewer_identity =
  { user_id, spectator_context: episode_id, as_character: CharacterId }

Seed message (per character):
  "Recall: in [episode_id], you [character arc summary from episode].
   The viewer [viewer_id] just watched that unfold. They may ask you about it."
```

This contract depends on: episodic memory (`epic-memory-knowledge-systems.md`), BDI state (`epic-npc-bdi-autonomy.md`), and the VN episode authoring surface.
