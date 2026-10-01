<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA-epic-npc-to-npc-social-2026-09-26: NPC-to-NPC Social Simulation (matrix gaps G29/G30)

**Status:** Not Started
**Priority:** medium (matrix 🟡 Medium severity, P6+ deferred)
**Effort:** Medium
**Epic:** epic-npc-bdi-autonomy.md
**Type:** Research
**Summary:** Matrix gaps G29 and G30 describe a single missing system: **NPC-to-NPC social simulation**. `TASK-npc-to-npc-social.md` exists as an orphan ticket, but no epic owns the integration with `epic-character-relationships.md` (relationship strength), `epic-memory-knowledge-systems.md` (episodic memory for conversation topics), and the planned BDI loop from `IDEA-epic-bdi-npc-autonomy`. Inspiration: generative-agents (Stanford), RisuAI NPC-to-NPC, AI Town.
**Context:** Source row: 2026-09-26 epic audit; matrix reference: `matrix-cross-mechanics.md` G29, G30 (2026-08-14 research sweep). The current `epic-group-chat.md` and `epic-social-interaction.md` cover *player-driven* social systems; this proposal covers **NPC-driven** social simulation — NPCs talk to each other without the player in the room, generating relationship drift and memory entries that the player later observes.

## Suggested epic description

### Title

`epic-npc-to-npc-social.md` — Autonomous NPC-to-NPC Social Simulation

### Status / Priority / Effort / Type

- Status: Not Started
- Priority: Medium (matrix 🟡 Medium severity; P6+ deferred under 0.1.0)
- Effort: Medium (runtime + relationship bridge + memory writer + catch-up surfacing)
- Type: Feature Epic

### Summary

A runtime that lets two (or more) NPCs converse autonomously when the player isn't present, modulated by their BDI intentions (from `IDEA-epic-bdi-npc-autonomy`), relationship strength (from `epic-character-relationships.md`), and shared episodic memory (from `epic-memory-knowledge-systems.md`). Conversations affect relationship evolution and generate new episodic memories, surfaced to the player as a "life log" entry when they return.

### Scope

1. **Conversation trigger** — BDI runtime (when shipped) or world-event scheduler decides "NPC A wants to talk to NPC B"; epic-consumes that trigger.
2. **Conversation runtime** — LLM-mediated two-party (or N-party) dialogue, anchored to each NPC's BDI state, mood, and recent memories. Generates a chat log similar to `epic-group-chat.md`'s output, but persisted as NPC-to-NPC interaction history.
3. **Relationship evolution** — post-conversation, each NPC's relationship delta is computed (positive if shared interests / resolved conflict; negative if betrayal / disagreement) and written to `epic-character-relationships.md`'s store.
4. **Memory write-through** — each NPC generates episodic memories from the conversation (e.g. "I argued with X about Y") written to `epic-memory-knowledge-systems.md`.
5. **Catch-up surfacing** — when the player returns, the NPC(s) can reference the conversation in their next interaction with the player (paraphrased, not full transcript; full transcript lives in their life log).
6. **Rate limiting** — to bound LLM cost, NPC-to-NPC conversations run at most N per in-world day per NPC-pair; operator-configurable.

### Tasks

- [ ] Conversation runtime (`src/npc/social/{runtime,trigger,log-store}.ts`)
- [ ] Relationship evolution bridge (read+write `epic-character-relationships.md`)
- [ ] Memory write-through bridge (read+write `epic-memory-knowledge-systems.md`)
- [ ] BDI integration (consume triggers from `IDEA-epic-bdi-npc-autonomy`; gracefully no-op if not yet shipped)
- [ ] Catch-up surfacing (life-log entry + in-conversation paraphrase)
- [ ] Rate limiting + operator config
- [ ] Tests for relationship + memory delta determinism (same inputs → same deltas)

**Acceptance Criteria:**
- [ ] Two NPCs with relationship strength 50 converse; post-conversation strength drifts ± 5 based on conversation content
- [ ] Each NPC generates ≥ 1 episodic memory from the conversation, retrievable in subsequent chats
- [ ] Catch-up surfacing paraphrases without leaking the full transcript; player can drill into the life log for the full text
- [ ] Rate limit honored: N conversations per in-world day per NPC-pair (operator-configurable, default 3)
- [ ] Cost: 100 NPC-pairs running for 7 simulated in-world days costs < $X (operator-configurable)
- [ ] Conversation runtime reuses `epic-group-chat.md`'s turn-taking + token-budget + log-store shape

### Related Epics

- `epic-character-relationships.md` — relationship strength (read+write)
- `epic-memory-knowledge-systems.md` — episodic memory (read+write)
- `epic-group-chat.md` — turn-taking + log-store shape (reused)
- `epic-social-interaction.md` — player-driven social systems (sibling; NPC-driven is the gap)
- `IDEA-epic-bdi-npc-autonomy.md` — BDI triggers (consume when shipped)
- `epic-npc-management-ui.md` — UI surface for life log
- `epic-time-scale.md` — game-time anchor for in-world day rate limiting

## Rationale

Matrix gap G29 ("NPC-to-NPC social sim needs relationship strength") and G30 ("needs episodic memory for conversation topics") are the same system: **NPC-to-NPC social sim, anchored to relationships and memory**. Without this epic:

1. **NPCs feel static when the player is away** — relationships don't drift, memories don't accumulate, the world feels frozen.
2. **Player-return catch-ups feel artificial** — without organic NPC activity between sessions, the "world continued without you" promise (matrix G20, AI Town inspiration) is hollow.
3. **RisuAI and AI Town already ship this** — competitor parity is a real user expectation, especially for the generative-agents crowd.

The dependency chain is clean: traits → BDI (separate epic) → relationships → memory → NPC-to-NPC runtime. The runtime itself is a thin orchestration layer over existing `epic-group-chat.md` plumbing; the heavy lifting is the integration glue.

## Open questions

1. **Conversation length** — one turn, three turns, or full chat? Generative-agents generate full multi-turn exchanges; AI Town uses short snippets. Default likely short (3-5 turns) for cost, but the runtime should support configurable depth.
2. **Player observation mode** — should the player be able to "eavesdrop" on NPC-to-NPC conversations? If yes, is that opt-in per NPC-pair, or always available? Privacy implications.
3. **Multi-party** — when 3+ NPCs are in a scene, do they all converse simultaneously, or pair off? Generative-agents uses pair-off; AI Town uses full N-party. Cost scales with N².
4. **Conflict** — what happens when two NPCs in conversation have opposing BDI intentions (e.g. one wants to attack, the other wants to flee)? Generative-agents resolves via LLM; loop-lore's RPG context might want explicit rules.
5. **Continuity with `epic-federation-swarm-sync.md`** — if a peer instance owns one of the NPCs (federated), does the conversation cross instances? That's a separate scope; defer to federation.
6. **Cost ceiling** — operator should be able to set a daily LLM cost ceiling for NPC-to-NPC; runtime degrades gracefully when exceeded. What does graceful degradation look like? Skip the conversation? Pre-generated scripted fallback?
7. **Quality of generated conversation** — generative-agents can produce repetitive or nonsensical NPC dialogue. Quality bar is hard to enforce. Manual review of generated logs as part of acceptance?

**Tags:** idea, matrix-gap, g29, g30, npc-social, generative-agents, ai-town, risuai, cross-cutting
**Related:** .plan/matrix-cross-mechanics.md (G29, G30), .plan/epics/epic-character-relationships.md, .plan/epics/epic-memory-knowledge-systems.md, .plan/epics/epic-group-chat.md, .plan/tickets/TASK-npc-to-npc-social.md, .plan/epics/IDEA-epic-bdi-npc-autonomy.md

git issue: 00000000
