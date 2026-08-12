# TASK: Assistant Creative Studio — World Generation Workflow

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-worlds-extension.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-worlds-extension.md` (world data model)

## Summary

Implement the **world generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven world creation. Wraps the existing `/create world`
backend with prompt preview, step validation, and confirmation gating (see
`TASK-assistant-gm-flows.md`).

## Design (from epic §7.6)

- **`intent.target`:** `world` — already in `INTENT_PATTERNS` (`src/regex/intent.ts` L48).
- **Step schema (§7.6b):** `theme_genre`, `tone`, `core_conflict`, `geography_sketch`,
  `magic_tech_level`.
- **`entity_type_presets.world` (§7.6c):** required steps (theme/tone/conflict);
  validation (genre enum, name length); consistency gates `schema` + `duplicate`;
  `dispatch_target: world-create`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`.
- **Dispatch backend:** world creation service (world insert).

## Acceptance Criteria

- [ ] `configs/templates/workflows/world-generation.yaml` defines the workflow
      (intent.target `world`, steps, dispatch, approval).
- [ ] `entity_type_presets.world` added to
      `configs/templates/workflows/entity-types.yaml`.
- [ ] `INTENT_PATTERNS` routes `create/generate/new world` triggers to the workflow.
- [ ] Runner validates each step; blocks on schema/consistency/duplicate failure.
- [ ] Confirmation gate required before dispatch.
- [ ] Dispatch creates the world with seeded default identity context (see
      `FEAT-origin-capture-generation-seeding.md` for culture-bearing world lore).
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
      world creation via `/create` wrapped by the workflow.

## Files

| File                                                | Action                 |
| --------------------------------------------------- | ---------------------- |
| `configs/templates/workflows/world-generation.yaml` | new                    |
| `configs/templates/workflows/entity-types.yaml`     | modify                 |
| `src/regex/intent.ts`                               | verify (target exists) |
| `src/assistant/workflow-runner.ts`                  | reuse                  |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6
- `epic-worlds-extension.md`
- `TASK-assistant-gm-flows.md` (gating resolution)
- `FEAT-origin-capture-generation-seeding.md`
- `TASK-assistant-creative-studio-workflows.md` (parent task)
