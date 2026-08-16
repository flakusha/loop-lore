<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cleanup banned types console logging magic strings

**Status:** ✅ Done
**Priority:** low
**Effort:** Small
**Related:** TASK-quest-status-transitions-bypass-state-machine, TASK-data-migrations-atomicity-and-concurrency-guard

## Summary

Remove Kysely<any>, console.warn, as never literals; type resolveSystemPrompt purpose.

## Context

Small hygiene fixes surfaced by review — banned patterns and type-safety bypasses that the `check` gate does not currently flag.

- `src/db/migration-helpers.ts:31` — `Kysely<any>` in `boolToEnum` / `batchBoolToEnum` (banned pattern). Prefer `Kysely<unknown>` or a narrow interface. Also: `boolToEnum` is untransactioned — a mid-failure leaves the temp column; rows with values ∉ {0,1} silently become `falseValue`.
- `src/config/load/safety.ts:51` — `console.warn` instead of the logger (banned pattern).
- `src/story/shared/story-utils.ts:139` — `"active" as never` instead of `QuestStatus.Active`.
- `src/prompts/registry.ts:113` — `resolveSystemPrompt(templates, purpose: string)`; docstring claims `PromptPurpose` type-checking but the signature is a plain string. Either introduce the typed purpose union or fix the doc.

## Acceptance Criteria

- [ ] No `Kysely<any>` remains in `src/db/` (migration helpers, data migrations runner)
- [ ] `safety.ts` logs the network-filesystem warning via the logger
- [ ] Status literals use enum constants, not `as never`
- [ ] `resolveSystemPrompt` purpose is typed (or doc corrected) — `LLM_PROMPT_DEFAULTS` keyed by the same union
- [ ] `boolToEnum` wrapped in a transaction; undefined/other values logged instead of silently coerced
- [ ] `bun run check` green
