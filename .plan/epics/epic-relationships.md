<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Relationships

**Overview:** (see sections below)


**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** relationships, romance, social, companion, bond

## Overview

Character relationship system — romance, friendship, rivalry, loyalty, trust, and social bonding mechanics. Covers relationship states, progression, decay, jealousy, commitment, and social dynamics between characters and the player.

## Relationship Systems

### Core Relationship Model

interface Relationship {
}
interface RelationshipState {
}
interface RelationshipProgress {
}
interface AffinityLevel {
}
interface BondTier {
}

### Romance & Attraction

interface RomanceState {
}
interface AttractionProfile {
}
interface FlirtAction {
}
interface RomanceMilestone {
}
interface JealousyEvent {
}

### Social Bonds

interface Friendship {
}
interface Rivalry {
}
interface Loyalty {
}
interface TrustLevel {
}
interface Commitment {
}

### Relationship Events

interface RelationshipEvent {
}
interface RelationshipTrigger {
}
interface RelationshipDecay {
}
interface RelationshipRepair {
}

## Key Behaviors

- Relationships evolve through interactions, gifts, dialogue choices, and shared experiences
- Romance has multiple stages with unlockable content and scenes
- Jealousy and rivalry create dynamic social tension
- Trust and loyalty affect companion behavior and story branching
- Relationships decay without maintenance and can be repaired through effort
- Commitment levels gate major story events and endings

## Dependencies

- `epic-character-core-system.md` (character stats, traits)
- `epic-social-interaction.md` (dialogue, social mechanics)
- `docs/spec/relationships.md` (design spec — reduced to a pointer 2026-09-21; design summary folded below)

## Design Spec Summary (folded from `docs/spec/relationships.md`, 2026-09-21)

- **Graph model:** `RelationshipGraph` (participants, edges, scope `chat | world | global`, per-scope metadata) of `RelationshipEdge` (source, target, type from an 11-value set: romantic/friendly/rival/enemy/familial/professional/mentor/student/trusted/suspicious/neutral, strength 0–100, event history, flags: isPlayerNpc/isNpcNpc/isPlayerPlayer, `nsfwEnabled`, `visibleTo[]`). Events carry type (interaction/choice/combat/trade/dialogue/quest), strengthDelta, initiator.
- **Strength levels:** Stranger 0–10, Acquaintance 11–25, Friend 26–45, Close Friend 46–65, Romantic Interest 66–75, Dating 76–85, Intimate 86–95, Soulbonded 96–100 (permanent effects).
- **Propagation:** NPC-NPC changes affect dialogue options; strength lowers DCs for friendly social checks; allied-faction NPCs gain +10 strength; faction enemies capped at `suspicious`; combat allies/enemies accrue strength; kill events create permanent shifts.
- **Integration:** NSFW gated by relationship type + intimacy level, per-user per-chat opt-in/out applies; social skill outcomes modify strength; same-faction characters drift closer over time.
- **Storage:** graphs are separate documents from character data — chat-scoped stored with the chat session, world-scoped with world state, global in a shared collection; versioned for replay/catch-up.
- **Implementation state:** design only — no relationship-graph code in `src/`.

## Docs-Gap Audit Remainders (2026-09-19)

- [ ] [gap-audit E28] Relationship drift-timeline visualizer UI
