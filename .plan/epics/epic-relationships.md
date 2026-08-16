<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Relationships

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
- `specs/relationships.md` (full design spec)
