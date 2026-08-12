# TASK: Assistant Creative Studio — Item Generation Workflow

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-items.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-items.md` (item data model), `TASK-item-generation.md` (LLM endpoint),
`epic-rarity-extensions.md` / `epic-item-systems-unification.md` (rarity/balance)

## Summary

Implement the **item generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven item creation. Wraps the item-generation backend with
prompt preview, step validation, and confirmation gating. This is the canonical
"Creative Studio's item workflow" referenced by `TASK-item-generation.md` (L11/L18),
closing the gap where `/create item` inserts directly with no quality pipeline.

## Design (from epic §7.6)

- **`intent.target`:** `item` — already in `INTENT_PATTERNS` (`src/regex/intent.ts` L34).
- **Step schema (§7.6b):** `category`, `rarity_range`, `stats_intent`, `lore_flavor`,
  `tags_theme`.
- **`entity_type_presets.item` (§7.6c):** `required_steps: [category, rarity,
  stats_intent]`; validation (rarity enum: common/uncommon/rare/epic/legendary);
  consistency gates `schema` + `balance` (stats within world progression curve) +
  `duplicate`; `dispatch_target: item-generate-llm`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`, `balance`.
- **Dispatch backend:** `POST /api/worlds/:worldId/items/generate-llm`
  (from `TASK-item-generation.md`).

## Acceptance Criteria

- [ ] `configs/templates/workflows/item-generation.yaml` defines the workflow
      (intent.target `item`, steps, dispatch, approval).
- [ ] `entity_type_presets.item` added to
      `configs/templates/workflows/entity-types.yaml`.
- [ ] `INTENT_PATTERNS` routes `create/generate/new/craft item` triggers to the workflow.
- [ ] Runner validates each step; blocks on schema/balance/duplicate failure.
- [ ] Confirmation gate required before dispatch.
- [ ] Dispatch calls `POST /api/worlds/:worldId/items/generate-llm` and creates the item
      definition in the world (unified item types per `TASK-unify-item-types.md`).
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
      item generation via the workflow.

## Files

| File                                               | Action                 |
| -------------------------------------------------- | ---------------------- |
| `configs/templates/workflows/item-generation.yaml` | new                    |
| `configs/templates/workflows/entity-types.yaml`    | modify                 |
| `src/regex/intent.ts`                              | verify (target exists) |
| `src/assistant/workflow-runner.ts`                 | reuse                  |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6
- `epic-items.md`, `epic-item-systems-unification.md`, `epic-rarity-extensions.md`
- `TASK-item-generation.md` (the LLM endpoint this workflow wraps)
- `TASK-assistant-gm-flows.md` (gating resolution)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
