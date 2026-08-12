# TASK: Assistant Creative Studio — NPC Generation Workflow

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-npcs.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-npcs.md` (NPC data model), `epic-faction-reputation.md` (allegiance)

## Summary

Implement the **NPC generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven NPC creation. Wraps the actor-insert backend (with
`is_npc`) with prompt preview, step validation, and confirmation gating. Unlike the
other four entity types, `npc` is **not** yet an `INTENT_PATTERNS` target — this task
adds it (per §7.6a decision: prefer a distinct `npc` target over reusing `character`).

## Design (from epic §7.6)

- **`intent.target`:** `npc` — **NEW**, must be added to `INTENT_PATTERNS`
  (`src/regex/intent.ts`). Triggers: `create/generate/new npc`, `make.*npc`.
- **Step schema (§7.6b):** `role_function`, `faction_allegiance` (see
  `epic-faction-reputation.md`), `personality`, `relationship_to_player`.
- **`entity_type_presets.npc` (§7.6c):** required steps (role/faction/personality);
  validation; consistency gates `schema` + `duplicate` + `consistency`;
  `dispatch_target: actor-insert` with `is_npc: true`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`.
- **Dispatch backend:** actor insert with `is_npc` flag, scoped by `world_id`.

## Acceptance Criteria

- [ ] `npc` added as a `generate` target in `INTENT_PATTERNS` with appropriate triggers.
- [ ] `configs/templates/workflows/npc-generation.yaml` defines the workflow
      (intent.target `npc`, steps, dispatch, approval).
- [ ] `entity_type_presets.npc` added to
      `configs/templates/workflows/entity-types.yaml`.
- [ ] `INTENT_PATTERNS` routes `create/generate/new npc` triggers to the workflow.
- [ ] Runner validates each step; blocks on schema/consistency/duplicate failure.
- [ ] Confirmation gate required before dispatch.
- [ ] Dispatch inserts the actor with `is_npc: true` and correct `world_id` scoping.
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
      NPC creation via `/create` wrapped by the workflow.

## Files

| File                                              | Action                    |
| ------------------------------------------------- | ------------------------- |
| `src/regex/intent.ts`                             | modify (add `npc` target) |
| `configs/templates/workflows/npc-generation.yaml` | new                       |
| `configs/templates/workflows/entity-types.yaml`   | modify                    |
| `src/assistant/workflow-runner.ts`                | reuse                     |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6 (§7.6a `npc` decision)
- `epic-npcs.md`, `epic-faction-reputation.md`
- `TASK-assistant-gm-flows.md` (gating resolution)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
