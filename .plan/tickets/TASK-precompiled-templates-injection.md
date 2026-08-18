<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Pre-compiled Templates Message/Context Injection

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Many creative generation processes share a recurring shape: each has (a) an *internal schema* describing the expected output structure, and (b) an *example / scenario* illustrating a canonical filled instance. Injecting the schema + example into the generation prompt — at the beginning **or** end of the assistant message/context — gives the LLM deterministic, schema-steered guidance, improving output compliance and reducing malformed/partial results.

This is the "pre-compiled templates message/context injection" extension to the Assistant/GM flows epic.

## Motivation (from epic extension request)

Creative processes such as character creation, prompt creation, image/video/audio prompting, item/world/location/story creation each carry an internal schema and a worked example. Appending (or prepending) that schema-as-example to the assistant message adds deterministic clarity to the creative process and yields schema-compliant / schema-steered documents.

## Current State (precondition)

- `src/assistant/prompt/templates/entity-generation.ts` centralizes entity-gen prompts via `resolveEntityGenerationPrompt(config, kind, description)`, with a config override at `config.templates.llm.entityGeneration`.
- **Gap:** `src/assistant/commands/create.ts` still uses its own inline `entityPrompts` + `generateEntityData` and does **not** import `resolveEntityGenerationPrompt`. The centralized template system is therefore orphaned from the command flow. This task depends on closing that wiring gap.

## Design / Approach

1. **Pre-compiled template registry** — per creative-process kind, a `{ schema: string, example: string }` pair (schema = compact field spec; example = one canonical filled instance / scenario). Ship the four entity kinds first (character/location/world/item); the structure generalizes to story / image / video / audio / generic-prompt kinds via the same registry.
2. **Injection helper** — assemble the final prompt as `baseInstruction` + schema+example block, with a configurable `position: "before" | "after"` (default `after`, so the instruction stays prominent). `off` disables injection.
3. **Extend `resolveEntityGenerationPrompt`** to embed the precompiled schema+example (config-overridable; `config.templates.llm.entityGenerationInject` selects position or disables).
4. **Wire `create.ts`** `generateEntityData` to call `resolveEntityGenerationPrompt` instead of the inline `entityPrompts` — completes the orphaned-template cutover carried over from the quality-gating work.
5. **Config schema** — add `entityGenerationInject?: "before" | "after" | "off"` to `LlmTemplateConfig` (`configs/templates/llm.yaml`).
6. **Tests** — injection position, config-override precedence, schema/example presence in the rendered prompt, and `create.ts` no longer emitting the inline-only prompt.

## Acceptance Criteria

- [ ] Schema + example injected per kind at the configured position.
- [ ] `create.ts` uses the centralized prompt builder (inline `entityPrompts` removed).
- [ ] Config override (`before`/`after`/`off`) honored; default `after`.
- [ ] Unit tests pass; no regression in `entity-creation.test.ts` / `create.test.ts`.

## Open Questions

- Example representation: literal JSON sample vs. natural-language scenario? Proposal: both — a compact schema block + one worked example.
- Should examples be per-world/per-setting overridable? Deferred (out of scope).
- Generalize to non-entity flows (story / image / video / audio generation) — separate follow-up tickets once the entity path is proven.

## Related

- `TASK-creation-quality-gating-confirmation.md` — same `/create` flow; this adds deterministic prompt steering on top of the quality gates.
- `FEAT-lore-structured-generation-via-assistant.md` — structured generation context.
- `epic-assistant-gm-flows.md` — "Pre-compiled Templates Message/Context Injection (Extension)" section.
