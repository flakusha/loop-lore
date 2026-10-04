<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Disease & Poison Systems Specification

> **Status:** Expanded 2026-10-02 from an auto-generated STUB. Grounded in `src/` (authoritative).
> Owner epic `.plan/epics/epic-disease-poison.md` is **Not Started**: only the shared
> status-effect substrate and integration edges exist; there is no disease/poison engine.

## Overview

Disease and poison mechanics — afflictions, symptoms, cures, resistance, and healing. Integrates
with alchemy for antidote creation and combat for poison application.

## Scope

Shipped:

- **Integration edges:** `src/rpg/integration-registry/edges/disease.ts` — `DISEASE_EDGES`
  (disease↔weather, disease↔nsfw; e.g. waterborne spread, STDs, pregnancy complications).
- **Shared status-effect model:** `src/battle/integration-schemas/status.ts` — `StatusEffectType`
  (shared by RPG, Magic, Disease, Social).
- **State layers:** `src/rpg/integration-registry/player-state-layers.ts` — disease owns the `PhysicalState` layer.
- **Reproduction hook:** `src/rpg/reproduction/index.ts` emits `disease.reproductive_complication`
  status rows.
- **Antidote item:** `src/rpg/loot/templates.ts` — `Antidote` with
  `metadata.cures = ["poison", "disease"]`.

Open (owner epic, Not Started):

- Disease types/transmission/symptoms, poison effects, cures, resistance, and healing — no
  dedicated `src/` module.

## Technical Design

- Afflictions attach via shared status-effect rows (`category: "disease"`) — e.g.
  `disease.reproductive_complication` in `src/rpg/reproduction/index.ts` — rather than a bespoke
  disease store.
- Cross-system wiring is declared in the integration registry, not implemented as an engine.

## Integration Points

- `src/rpg/integration-registry/edges/disease.ts` — weather/nsfw edges.
- `src/battle/integration-schemas/status.ts` — shared status-effect type.
- `src/rpg/integration-registry/player-state-layers.ts` — `PhysicalState` layer.
- `src/rpg/loot/templates.ts` — antidote consumable.

## Related Epics

- `.plan/epics/epic-disease-poison.md` — owner (Not Started)
- `.plan/epics/epic-nsfw-integration-gaps.md`
