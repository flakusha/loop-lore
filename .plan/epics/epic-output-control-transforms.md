# EPIC: Prompt & Output Control

**Status:** ⬜ Not Started
**Priority:** Medium
**Plan.md:** §51
**Issue:** `EPIC-2026-38`

## Summary

Regex output transforms, smart-regen, prompt library, lore-consistency checker, auto-translation.

## Tasks

| Task                                     | Files                                 | Effort | Source      |
| ---------------------------------------- | ------------------------------------- | ------ | ----------- |
| Regex output transforms (post-gen)       | `src/generation/transforms.ts` (new)  | Low    | plan.md §51 |
| Smart-regen polish (partial message fix) | `src/generation/smart-regen.ts` (new) | Med    | plan.md §51 |
| Prompt library (save/reuse templates)    | `src/routes/prompts.ts` (new)         | Med    | plan.md §51 |
| Lore-consistency checker                 | `src/lorebook/consistency.ts` (new)   | High   | plan.md §51 |
| Regex output transforms (render-time)    | `src/frontend/render-transforms.ts`   | Low    | ideas #6    |
| Auto-translation layer                   | `src/generation/translate.ts` (new)   | Med    | ideas #7    |
| Smart-regen style rewrites               | `src/generation/smart-regen.ts`       | Low    | ideas #8    |
| Prompt-template marketplace              | `src/routes/marketplace.ts` (new)     | Med    | ideas #9    |

## Ideas Merged

- `docs/ideas/prompt-output-control.md` — ideas #6 (regex transforms), #7 (auto-translation), #8 (smart-regen), #9 (prompt marketplace)

## Dependencies

- Assistant command parser (`docs/spec/assistant-commands.md`) for smart-regen
- i18n (`docs/frontend/internationalization.md`) for auto-translation
- Export/share infra (`docs/frontend/chat/export.md`) for marketplace
- Plugin registry for marketplace versioning

## Linked Tasks

- TASK-output-control-transforms.md
