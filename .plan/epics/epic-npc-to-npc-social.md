<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Autonomous NPC-to-NPC Social Simulation

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** npc-social, generative-agents, cross-cutting
**Related:** epic-relationships.md, epic-memory-knowledge-systems.md, epic-group-chat.md, epic-npc-bdi-autonomy.md, epic-npc-management-ui.md, epic-time-scale.md, epic-social-interaction.md
**Overview:** Autonomous NPC-to-NPC social simulation — the NPC-driven counterpart to the player-driven social systems in `epic-group-chat.md` and `epic-social-interaction.md`, closing matrix gaps G29/G30. A runtime lets NPCs converse without the player present, anchored to each NPC's BDI intentions, relationship strength, and shared episodic memory; conversations drive relationship evolution and write new episodic memories, surfaced to the returning player as a life-log entry.

## Summary

A runtime that lets two (or more) NPCs converse autonomously when the player isn't present, modulated by their BDI intentions, relationship strength, and shared episodic memory. Conversations affect relationship evolution and generate new episodic memories, surfaced to the player as a "life log" entry when they return.

## Scope

1. **Conversation trigger** — BDI runtime or world-event scheduler decides "NPC A wants to talk to NPC B"; this epic consumes that trigger.
2. **Conversation runtime** — LLM-mediated two-party (or N-party) dialogue, anchored to each NPC's BDI state, mood, and recent memories. Generates a chat log similar to `epic-group-chat.md`'s output, but persisted as NPC-to-NPC interaction history.
3. **Relationship evolution** — post-conversation, each NPC's relationship delta is computed (positive if shared interests / resolved conflict; negative if betrayal / disagreement) and written to the relationship store.
4. **Memory write-through** — each NPC generates episodic memories from the conversation (e.g. "I argued with X about Y") written to episodic memory.
5. **Catch-up surfacing** — when the player returns, the NPC(s) can reference the conversation in their next interaction with the player (paraphrased, not full transcript; full transcript lives in their life log).
6. **Rate limiting** — to bound LLM cost, NPC-to-NPC conversations run at most N per in-world day per NPC-pair; operator-configurable.

## Work Items

- [ ] Conversation runtime (`src/npc/social/{runtime,trigger,log-store}.ts`)
- [ ] Relationship evolution bridge (read+write to relationship store)
- [ ] Memory write-through bridge (read+write to episodic memory)
- [ ] BDI integration (consume triggers from `epic-npc-bdi-autonomy.md`; gracefully no-op if not yet shipped)
- [ ] Catch-up surfacing (life-log entry + in-conversation paraphrase)
- [ ] Rate limiting + operator config
- [ ] Tests for relationship + memory delta determinism (same inputs → same deltas)

## Acceptance Criteria

- [ ] Two NPCs with relationship strength 50 converse; post-conversation strength drifts ± 5 based on conversation content
- [ ] Each NPC generates ≥ 1 episodic memory from the conversation, retrievable in subsequent chats
- [ ] Catch-up surfacing paraphrases without leaking the full transcript; player can drill into the life log for the full text
- [ ] Rate limit honored: N conversations per in-world day per NPC-pair (operator-configurable, default 3)
- [ ] Cost: 100 NPC-pairs running for 7 simulated in-world days stays within operator-configured cost ceiling
- [ ] Conversation runtime reuses `epic-group-chat.md`'s turn-taking + token-budget + log-store shape

## Rationale

Matrix gaps G29 ("NPC-to-NPC social sim needs relationship strength") and G30 ("needs episodic memory for conversation topics") are the same system: **NPC-to-NPC social sim, anchored to relationships and memory**. Without this epic:

1. **NPCs feel static when the player is away** — relationships don't drift, memories don't accumulate, the world feels frozen.
2. **Player-return catch-ups feel artificial** — without organic NPC activity between sessions, the "world continued without you" promise is hollow.
3. **RisuAI and AI Town already ship this** — competitor parity is a real user expectation, especially for the generative-agents crowd.

The dependency chain is clean: traits → BDI (separate epic) → relationships → memory → NPC-to-NPC runtime. The runtime itself is a thin orchestration layer over existing `epic-group-chat.md` plumbing; the heavy lifting is the integration glue.

## Open Questions

1. **Conversation length** — one turn, three turns, or full chat? Default likely short (3-5 turns) for cost, but the runtime should support configurable depth.
2. **Player observation mode** — should the player be able to "eavesdrop" on NPC-to-NPC conversations? If yes, is that opt-in per NPC-pair, or always available? Privacy implications.
3. **Multi-party** — when 3+ NPCs are in a scene, do they all converse simultaneously, or pair off? Cost scales with N².
4. **Conflict** — what happens when two NPCs in conversation have opposing BDI intentions (e.g. one wants to attack, the other wants to flee)? Generative-agents resolves via LLM; loop-lore's RPG context might want explicit rules.
5. **Continuity with federation** — if a peer instance owns one of the NPCs (federated), does the conversation cross instances? That's a separate scope; defer to federation.
6. **Cost ceiling** — operator should be able to set a daily LLM cost ceiling; runtime degrades gracefully when exceeded. What does graceful degradation look like?
7. **Quality of generated conversation** — generated NPC dialogue can be repetitive or nonsensical. Quality bar is hard to enforce. Manual review of generated logs as part of acceptance?

## Dependencies

- `epic-npc-bdi-autonomy.md` — BDI triggers (consume when shipped; gracefully no-op if not)
- `epic-relationships.md` — relationship strength (read+write)
- `epic-memory-knowledge-systems.md` — episodic memory (read+write)
- `epic-group-chat.md` — turn-taking + log-store shape (reused)
- `epic-social-interaction.md` — player-driven social systems (sibling; NPC-driven is the gap)
- `epic-npc-management-ui.md` — UI surface for life log
- `epic-time-scale.md` — game-time anchor for in-world day rate limiting
- `epic-federation-swarm-sync.md` — federated NPC cross-instance conversations (future)
