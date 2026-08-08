# TASK: Prompt Template Registry — Typed Purposes, Single Defaults Source

**Status:** ✅ Complete
**Priority:** Medium
**Effort:** Low–Med
**Epic:** epic-config-templates
**Related:** FEAT-065-template-system.md (unified registry — LLM foundation), epic-assistant-generation-extensions.md (prompt-library backend), FEAT-chat-template-config-lifecycle.md (chat setup templates — distinct domain), .plan/epics/epic-config-templates.md

## Summary

Harden the config-driven LLM prompt template registry (`src/prompts/registry.ts`) that was
shipped in `9aefe593` (feat: config-driven LLM text templates + GM/aux wiring): typed purpose
keys, single source of truth for defaults, dead accessor removal, and llm.yaml load validation.

> **Completed 2026-08-04.** Implementation also wired the previously-dormant `nsfw` purpose
> into the NSFW gate's LLM classifier (behind `nsfw.useLlmClassifier`) and added an injectable
> `nsfwPolicy` section (SRW/NSFW level taxonomy) to the prompt assembler. See the scope below
> for the checked items and the two additions.

## Background

`LLM_PROMPT_DEFAULTS` (12 purposes: chat/summarize/imagePrompt/ooc/assistant/gm/nsfw/vn/
vnChoices/transition/intent/memory) + `resolveSystemPrompt()` already layer user config
(`configs/templates/llm.yaml`, extend/override/replace merge) over code defaults. 10 consumers
wired (assistant, gm, vn, vnChoices, transition, intent, memory). Design: `.plan/epics/epic-config-templates.md`.

## Scope

- [x] `PromptPurpose` union (`src/prompts/purposes.ts`) + typed named keys on `LlmSystemPrompts`
      (index signature retained for custom purposes); typed overload on `resolveSystemPrompt`
- [x] `TEMPLATES_DEFAULTS.llm.systemPrompts` → `{}` — `LLM_PROMPT_DEFAULTS` becomes sole defaults
      source (config layer = user overrides only; no import-layering inversion)
- [x] Delete dead accessors `src/config/sections/llm-templates.ts` (getSystemPrompt/
      getAllSystemPrompts/getChatFormat/listChatFormats — zero consumers)
- [x] Runtime validation of `configs/templates/llm.yaml` on load (systemPrompts values are
      strings, chatFormats shape, merge strategy legal) — fail fast, clear error
- [x] Update tests: `src/config/templates-loader.test.ts` (empty-default merge assertions),
      `src/prompts/registry.test.ts` (purpose typing)
- [x] Docs: legacy purposes + chatFormats dormancy in `configs/templates/llm.example.yaml`

## Implemented Additions (2026-08-04)

- [x] **NSFW LLM classifier wired** — `src/nsfw/runtime-config.ts` + `NsfwConfig` gained
      `useLlmClassifier` (default false). `NsfwHook.detectWithLlm` calls
      `resolveSystemPrompt(config.templates.llm, "nsfw")` + `callAux("nsfw", …)` to classify
      content the keyword pass missed, degrading gracefully to "none" on any LLM failure.
- [x] **NSFW policy injection** — new `nsfwPolicy` purpose (default `NSFW_POLICY_LEVELS_PROMPT`,
      in `src/prompts/registry.ts`) describing the SFW→nsfw_extreme taxonomy, injected as a
      system section (`src/assistant/prompt/sections/nsfw-policy.ts`) into assembled chat
      prompts when `nsfw.allowNsfw` is enabled. `PromptParams.config` / `AssembleContext.config`
      threaded so the section resolves the config-overridable prompt.

## Out of Scope (later tickets)

- `{{var}}` interpolation for LLM prompts (reuse `generation/prompt-templates.ts` renderTemplate)
- `chatFormats` consumer (vLLM-style chat formatting path)
- DB-backed user template library (`TASK-prompt-library.md`) — this registry is the config-file
  foundation for it

## Acceptance Criteria

- [x] `resolveSystemPrompt` resolves all purposes, config override → code default
- [x] Typo in a purpose key is a type error; custom purposes still load from config
- [x] Malformed llm.yaml rejected at load with actionable error
- [x] No behavioral change for existing wired consumers (LLM classifier off by default)
- [x] `bun run check` = baseline (pre-existing lint-ts + size-strict + md-lint remain)

## Files

- `src/prompts/purposes.ts` (new), `src/prompts/registry.ts`, `src/config/sections/templates.ts`
- `src/config/templates-loader.ts` (validation), `src/config/sections/llm-templates.ts` (rm)
- `src/prompts/registry.test.ts`, `src/config/templates-loader.test.ts`
- `configs/templates/llm.example.yaml`
- `src/nsfw/runtime-config.ts`, `src/nsfw/moderation-service.ts` (n/a), `src/config/sections/nsfw.ts`,
  `src/config/schema.ts`, `src/config/schema-class.ts`
- `src/generation/hooks/nsfw-hook.ts`
- `src/assistant/prompt/sections/nsfw-policy.ts` (new) + `.test.ts`, `src/assistant/prompt/types.ts`,
  `src/assistant/prompt/registry.ts`, `src/assistant/prompt-assembler.ts`
- `src/generation/hooks/hooks.test.ts`, `src/generation/hooks/e2e-integration.test.ts`,
  `src/nsfw/runtime-config.test.ts`
- `configs/config.example.yaml`, `configs/config.example.toml`
