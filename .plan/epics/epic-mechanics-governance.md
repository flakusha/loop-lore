<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Mechanics Governance — Per-World Config, Control Levels & Plugin API

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** rpg, governance, per-world-config, plugin-api, admin-ui
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)
**Sequencing:** SECOND — after epic-rpg-core-wiring.md; gates per-world rollout of every mechanic

## Summary

Per-world mechanics configuration (`WorldMechanicsConfig`), enable/disable of individual mechanics per roleplay/world, the Admin/GM/World-Creator/Player control-level model, the plugin mechanics API, and the Admin/GM configuration UI. This is the rollout gate: no mechanic ships to worlds without a governance switch.

## Sub-Epic of

Part of the **RPG Mechanics & Extensible Game Systems** mega-epic. See parent epic for full scope, integration matrix, and slicing rationale.

## Scope

- Per-world mechanics configuration
- Mechanics disable/enable per world
- Control levels (Admin / GM / World Creator / Player)
- Plugin mechanics API (`plugins/core/` built-ins + user-defined mechanics)
- Admin/GM mechanics UI

## Design

### Per-World Configuration

```typescript
interface WorldMechanicsConfig {
  enabledMechanics: string[]; // ['dice', 'stats', 'combat', 'quests']
  settings: {
    diceSystem: "d20" | "d100" | "fate" | "custom";
    combatStyle: "turn-based" | "real-time" | "narrative";
    statsModel: "dnd" | "pathfinder" | "custom";
    economyEnabled: boolean;
    questSystemEnabled: boolean;
  };
  customRules: Record<string, unknown>;
}
```

### Control Levels

| Level         | Can Configure       | Scope         |
| ------------- | ------------------- | ------------- |
| Admin         | All mechanics       | System-wide   |
| GM            | World mechanics     | Per world     |
| World Creator | World mechanics     | Per world     |
| Player        | Character mechanics | Per character |

### Command Access Tiers (from implementation roadmap)

Commands have access tiers based on world rules:

| Command  | Default Tier | GM Override         |
| -------- | ------------ | ------------------- |
| /improve | all          | whitelist/blacklist |
| /dice    | all          | whitelist/blacklist |
| /stats   | all          | whitelist/blacklist |
| /attack  | member       | whitelist/blacklist |
| /damage  | gm           | whitelist/blacklist |
| /heal    | gm           | whitelist/blacklist |
| /quest   | gm           | whitelist/blacklist |
| /image   | member       | configurable cost   |

The registry it toggles against lives in `epic-rpg-core-wiring.md`
(`src/rpg/registry.ts`); a `world-gate` service scaffold already exists at
`src/rpg/service/world-gate.ts`.

## Tasks

- [ ] Per-world mechanics configuration
- [ ] Plugin mechanics API
- [ ] Admin/GM mechanics UI
- [ ] Mechanics disable/enable per world

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (Config Extensions dependency row)
- **Depends on:** epic-rpg-core-wiring.md (registry module — FIRST in sequence); this epic is SECOND
- **Siblings:** gates rollout of progression, items/economy (`economyEnabled`), content systems (`questSystemEnabled`)
- **External:** Config Extensions (`epic-config-extensions.md`), Plugin System (`epic-plugin-system.md`), Frontend Admin (`epic-frontend-admin.md`) for the UI surface

## Files

- `plugins/core/` — built-in mechanics plugins (not yet implemented)
- `src/rpg/service/world-gate.ts` — world gating service scaffold (exists)

## Open Questions

- How should RPG mechanics interact with LLM generation?
- Should mechanics be enforced or suggested?
- How to handle player vs. character knowledge?
- Should mechanics be visible to all players or hidden?
