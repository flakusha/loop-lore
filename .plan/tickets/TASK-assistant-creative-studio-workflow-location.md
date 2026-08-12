# TASK: Assistant Creative Studio — Location Generation Workflow

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-locations.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-locations.md` (location data model)

## Summary

Implement the **location generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven location creation. Wraps the existing `/create location`
backend with prompt preview, step validation, and confirmation gating (see
`TASK-assistant-gm-flows.md`).

## Design (from epic §7.6)

- **`intent.target`:** `location` — already in `INTENT_PATTERNS`
  (`src/regex/intent.ts` L41).
- **Step schema (§7.6b):** `type` (city/region/dungeon), `environment_biome`,
  `notable_features`, `connections_travel`, `resource_profile`.
- **`entity_type_presets.location` (§7.6c):** required steps (type/environment);
  validation (type enum); consistency gates `schema` + `consistency` (geography must not
  contradict parent world) + `duplicate`; `dispatch_target: location-insert`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`.
- **Dispatch backend:** world-location insert (scoped by `world_id`).

## Acceptance Criteria

- [ ] `configs/templates/workflows/location-generation.yaml` defines the workflow
  (intent.target `location`, steps, dispatch, approval).
- [ ] `entity_type_presets.location` added to
  `configs/templates/workflows/entity-types.yaml`.
- [ ] `INTENT_PATTERNS` routes `create/generate/new location` / `world ... location`
  triggers to the workflow.
- [ ] Runner validates each step; blocks on schema/consistency/duplicate failure
  (e.g. impossible biome for parent world).
- [ ] Confirmation gate required before dispatch.
- [ ] Dispatch inserts the location scoped by `world_id` with valid connections.
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
  location creation via `/create` wrapped by the workflow.

## Files

| File                                            | Action |
| ----------------------------------------------- | ------ |
| `configs/templates/workflows/location-generation.yaml` | new    |
| `configs/templates/workflows/entity-types.yaml` | modify |
| `src/regex/intent.ts`                          | verify (target exists) |
| `src/assistant/workflow-runner.ts`             | reuse  |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6
- `epic-locations.md`
- `TASK-assistant-gm-flows.md` (gating resolution)
- `TASK-world-locations.md` (random location generation context)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
