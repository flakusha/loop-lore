<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NPC & Character Relationships Specification

> **Status:** Draft — design only; no relationship-graph code exists in `src/`. Content merged into the epic; this spec is a pointer.

## Where the content lives

- Full design — graph data model, 11 relationship types, strength 0–100 with eight levels (Stranger → Soulbonded), propagation rules, NSFW/social/faction/combat integration, storage layout — is preserved in `.plan/epics/epic-relationships.md` → "Design Spec Summary".

## Essence

- Relationship graphs connect characters (player + NPC) as documents scoped `chat | world | global`; edges carry type, strength, event history, and flags (audience, `nsfwEnabled`, `visibleTo`).
- Strength drives social-check DCs, dialogue availability, and NSFW gating; faction standing and combat outcomes propagate into edges.

## Dependencies

- `docs/spec/character-spec.md`, `docs/spec/nsfw.md`, `docs/spec/social-interaction.md` (design-domain siblings).

## Epics

- `.plan/epics/epic-relationships.md` — canonical home for this feature.
- `.plan/epics/epic-social-interaction.md` — social skills that modify edges.
