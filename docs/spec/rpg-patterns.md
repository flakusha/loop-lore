<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Flexible RPG Patterns Specification

> **Status:** Design catalogue — patterns below are design targets except where code is noted. Authoritative source is `src/` and AGENTS.md. Full treatment lives in `.plan/epics/epic-rpg-patterns.md` (~1050 lines), which supersedes this spec.

## Patterns (status in code)

- **Toggle per world** — minimal implementation: `worlds.rpg_enabled` gate (`src/rpg/service/world-gate.ts`, `requireRpgEnabled`). Per-subsystem toggles (dice/combat/crafting/factions) are not implemented — governance epic.
- **Plugin registration** (`RPGPlugin` hooks) — design target. Generic plugin infra exists in `src/plugins/` (loader, registry, `event-bus.ts`, mount-points) but is not RPG-specific. Config schemas use Elysia `t` (TypeBox) per `src/validation/` — an earlier revision showed `schema: ZodSchema`; the real stack validates via `src/validation/schemas/`, not Zod.
- **Resolution chain** (intent extraction → validation → resolution → state mutation → narrative generation) — primitives exist: `src/rpg/service/dice-roll.ts`, `src/battle/resolution-integration/` (checks, DC, initiative, attacks).
- **State machine** (idle / in-combat / in-dialogue / crafting / exploring) — design target; layer scaffold at `src/rpg/integration-registry/player-state-layers.ts`.
- **Effect system** (stacking modifiers + conditions) — implemented: `src/rpg/status-effects.ts`.
- **Event-driven subsystem messaging** — design target; generic bus at `src/plugins/event-bus.ts`.
- **Per-world config overrides / difficulty profiles** — design sketches, no code.

## Anti-patterns (unchanged)

No hardcoded mechanics that cannot be disabled; LLM never mutates state directly (engine is source of truth); no tight subsystem coupling; per-world/session state, never global.

## Epics

- `.plan/epics/epic-rpg-patterns.md` (authoritative)
- `.plan/epics/epic-plugin-system.md`
- `.plan/epics/epic-resolution-system.md`
- `.plan/epics/epic-logic-reconciliation.md`
- `.plan/epics/epic-rpg-mechanics.md`
