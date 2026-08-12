# TASK: Assistant Creative Studio — Character Generation Workflow

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-character-spec.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-character-spec.md` (character data model),
`FEAT-origin-capture-generation-seeding.md` (identity fields)

## Summary

Implement the **character generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven character creation. It wraps the existing `/create`
backend (`src/assistant/commands/create.ts` → actor insert) with the prompt preview,
step validation, and confirmation gating the base command lacks (see
`TASK-assistant-gm-flows.md`).

## Design (from epic §7.6)

- **`intent.target`:** `character` — already in `INTENT_PATTERNS` (`src/regex/intent.ts` L27).
- **Step schema (§7.6b):** `identity` (name/species/homeland/culture), `appearance`,
  `personality`, `backstory`, `motivation`, `world_scope` (select from user's worlds).
- **`entity_type_presets.character` (§7.6c):** `required_steps: [identity, appearance,
  personality]`; validation on `identity.name`/`identity.homeland`; consistency gates
  `duplicate` + `schema`; `dispatch_target: actor-insert`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`.
- **Dispatch backend:** `src/assistant/commands/create.ts` (actor insert, scoped by
  `world_id`).

## Acceptance Criteria

- [ ] `configs/templates/workflows/character-generation.yaml` defines the workflow
  (intent.target `character`, steps, dispatch, approval).
- [ ] `entity_type_presets.character` added to
  `configs/templates/workflows/entity-types.yaml`.
- [ ] `INTENT_PATTERNS` routes `create/generate/new character` triggers to the workflow.
- [ ] Runner validates each step against the preset; blocks on schema/consistency/duplicate failure.
- [ ] Confirmation gate required before dispatch.
- [ ] Dispatch inserts the actor with correct `world_id` scoping (no duplicate name+world).
- [ ] Identity fields align with `FEAT-origin-capture-generation-seeding.md` (`origin` →
  homeland, `culture` → culture, `species` → race).
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
  character creation via `/create` wrapped by the workflow.

## Files

| File                                                | Action |
| --------------------------------------------------- | ------ |
| `configs/templates/workflows/character-generation.yaml` | new    |
| `configs/templates/workflows/entity-types.yaml`    | modify |
| `src/regex/intent.ts`                              | verify (target exists) |
| `src/assistant/workflow-runner.ts`                 | reuse  |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6
- `epic-character-spec.md`
- `TASK-assistant-gm-flows.md` (gating resolution)
- `FEAT-origin-capture-generation-seeding.md`
- `TASK-assistant-creative-studio-workflows.md` (parent task)
