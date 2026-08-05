# Prompt Template Registry — Design

**Status:** Design
**Created:** 2026-08-03
**Scope:** Config-driven LLM text templates for assistant / gm / nsfw (+ vn + aux classifier) domains — single typed registry over the existing config-enhance machinery.
**Related:** `FEAT-chat-template-config-lifecycle.md` (chat setup templates — distinct domain, same "templates bound at creation" philosophy), `src/prompts/registry.ts`, `src/config/templates-loader.ts`, `src/config/sections/templates.ts`.

---

## 1. Problem

LLM system prompts for assistant / gm / nsfw / vn / aux classifiers are scattered across modules (`assistant-system.ts`, `vn.ts`, `aux-pipeline/prompts.ts`, `GM_SYSTEM_PROMPT`/`NSFW_POLICY_PROMPT` in `registry.ts`) and resolved through a code-defaults registry (`src/prompts/registry.ts`) layered under user config files (`configs/templates/llm.yaml`). The config-enhance machinery exists and is wired, but the registry is **untyped, has duplicated defaults, dead accessors, and an unwired nsfw purpose**.

## 2. Current State (verified 2026-08-03)

| Concern                       | Location                                                                                                                                                                                                                                                        | State                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config-enhance loader (merge) | `src/config/templates-loader.ts`                                                                                                                                                                                                                                | extend/override/replace per domain; llm merges `systemPrompts` + `chatFormats`                                                                                                |
| Config shapes + defaults      | `src/config/sections/templates.ts` `LlmSystemPrompts`/`LlmTemplateConfig`/`TEMPLATES_DEFAULTS`                                                                                                                                                                  | `LlmSystemPrompts` types only 4 keys (chat/summarize/imagePrompt/ooc); rest hidden behind `[key: string]: string`; `TEMPLATES_DEFAULTS.llm.systemPrompts` has the same 4 keys |
| Code registry                 | `src/prompts/registry.ts` `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt(templates, purpose)`                                                                                                                                                       | Source of truth for defaults; resolution = config override → code default                                                                                                     |
| Consumers (wired)             | assistant (`sections/system.ts`, `seed.ts`, `generate-route.ts`), gm (`game-master.ts`→`gm/decisions/llm.ts`, `auto-gen.ts`), vn/vnChoices (`vn-generate.ts`), transition (`transition-classifier.ts`), intent (`auto-gen.ts`), memory (`memory/extraction.ts`) | ✅ all call `resolveSystemPrompt`                                                                                                                                             |
| **nsfw purpose**              | `NSFW_POLICY_PROMPT` in `registry.ts`                                                                                                                                                                                                                           | ✅ **wired** (2026-08-04): `NsfwHook` LLM classifier when `nsfw.useLlmClassifier`                                                                                             |
| Legacy purposes               | `chat`, `summarize`, `imagePrompt`, `ooc` in `LLM_PROMPT_DEFAULTS`                                                                                                                                                                                              | ⚠️ zero runtime consumers (actors define own `system_prompt`; SD image prompts use `generation/prompt-templates.ts` `renderTemplate`, not this)                                |
| Dead accessors                | `src/config/sections/llm-templates.ts` (`getSystemPrompt`/`getAllSystemPrompts`/`getChatFormat`/`listChatFormats`)                                                                                                                                              | ❌ zero consumers — superseded by `resolveSystemPrompt`                                                                                                                       |
| `chatFormats`                 | `LlmTemplateConfig.chatFormats` (Jinja/vLLM-style system/user/assistant)                                                                                                                                                                                        | ⚠️ defined + config-loadable, **zero consumers**                                                                                                                               |
| `{{var}}` interpolation       | `generation/prompt-templates.ts` `renderTemplate` (SD only)                                                                                                                                                                                                     | LLM system prompts are **static** — `chat` default's `{{charName}}` never expands                                                                                             |

## 3. Design

### 3.1 Typed purpose union (fixes untyped purposes)

Introduce a first-class purpose set so config keys and registry defaults are checked, not free-form strings.

```ts
// src/prompts/purposes.ts
export const PROMPT_PURPOSES = [
  "chat",
  "summarize",
  "imagePrompt",
  "ooc", // legacy
  "assistant",
  "gm",
  "nsfw",
  "vn",
  "vnChoices", // generation domains
  "transition",
  "intent",
  "memory", // aux classifiers
] as const;
export type PromptPurpose = typeof PROMPT_PURPOSES[number];
```

`LlmSystemPrompts` keeps an index signature for user-defined custom purposes (config `systemPrompts.<custom>` must stay legal), but the twelve known purposes become named, typed keys. `resolveSystemPrompt` keeps its `string` purpose param but gains a `PromptPurpose`-typed overload for the known set.

### 3.2 Single source of truth (kills the duplicate defaults)

Today `TEMPLATES_DEFAULTS.llm.systemPrompts` repeats the same four values as `LLM_PROMPT_DEFAULTS` — two sources of truth that can drift.

- **`LLM_PROMPT_DEFAULTS` (in `src/prompts/registry.ts`) remains the single defaults source.** It owns the sub-prompt imports (`assistant-system`, `vn`, `aux-pipeline/prompts`), so the config layer never has to import generation-layer modules.
- **`TEMPLATES_DEFAULTS.llm.systemPrompts` → `{}`.** The config layer becomes _user overrides only_; `extend` merge then layers user keys onto an empty base, and `resolveSystemPrompt` supplies code defaults. This removes the duplication without inverting the import layering (config stays below prompts).
- `mergeLlmConfig` (extend/override) already spreads `...base.systemPrompts` then `...override.systemPrompts` — with `{}` base this is a no-op for defaults and still lands user keys. No loader change needed.
- **Update `src/config/templates-loader.test.ts`** assertions that rely on `TEMPLATES_DEFAULTS` carrying the four default prompts (they should now assert user-override merge only).

### 3.3 Remove dead accessors

Delete `src/config/sections/llm-templates.ts` (`getSystemPrompt`, `getAllSystemPrompts`, `getChatFormat`, `listChatFormats`) — zero consumers, superseded by `resolveSystemPrompt` + direct `config.templates.llm` access. This is a mechanical deletion; verify no imports remain.

### 3.4 Wire the nsfw purpose (✅ done 2026-08-04)

`NSFW_POLICY_PROMPT` is wired: when `nsfw.useLlmClassifier` is enabled, `NsfwHook` calls
`resolveSystemPrompt(config.templates.llm, "nsfw")` via `callAux("nsfw", …)` to classify content
the keyword pass missed, falling back to "none" (never blocks generation on an LLM error).
The `nsfwPolicy` purpose (`NSFW_POLICY_LEVELS_PROMPT`) is injected as a system section
(`src/assistant/prompt/sections/nsfw-policy.ts`) into assembled prompts when NSFW is allowed.

### 3.5 Validate llm.yaml on load (fail fast)

`loadTemplateConfig` currently does `raw as Partial<LlmTemplateConfig>` — a silent cast. Add a small runtime validator on the llm domain: `systemPrompts` values must be strings, `chatFormats` must be `{system,user,assistant}` shapes, `merge` must be a legal `MergeStrategy`. Reject malformed files with a clear error (mirroring the existing `Failed to load template config` throw). Keep it dependency-light (hand-rolled, no zod — the codebase uses Elysia `t`).

### 3.6 Legacy purposes + chatFormats — decision

- `chat`/`summarize`/`imagePrompt`/`ooc`: **keep in `LLM_PROMPT_DEFAULTS`** (harmless, documented, plausible near-future consumers: context compression → `summarize`). Mark legacy in the purpose union doc comment. Do not delete.
- `chatFormats` (vLLM-style): **keep dormant**, same as nsfw — config surface exists, no consumer today. Add a `docs/` note; wire separately if a chat-formatting path lands.

### 3.7 Variable interpolation (future, not in this task)

`{{charName}}` / `{{charDescription}}` in defaults never interpolate for LLM prompts (only SD image templates use `renderTemplate`). Document as a future enhancement: reuse `renderTemplate` from `generation/prompt-templates.ts` with a per-purpose context. Out of scope for the registry cleanup.

## 4. Deliverables

| # | Change                                                                               | File(s)                                                               |
| - | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1 | Add `PromptPurpose` union + typed keys on `LlmSystemPrompt`                          | `src/prompts/purposes.ts`, `src/config/sections/templates.ts`         |
| 2 | Empty `TEMPLATES_DEFAULTS.llm.systemPrompts`; keep `LLM_PROMPT_DEFAULTS` sole source | `src/config/sections/templates.ts`, update `templates-loader.test.ts` |
| 3 | Delete dead accessors                                                                | `src/config/sections/llm-templates.ts` (rm)                           |
| 4 | Add llm.yaml runtime validation                                                      | `src/config/templates-loader.ts`                                      |
| 5 | Docs: legacy purposes + chatFormats dormancy + nsffw wiring pointer                  | this doc + `configs/templates/llm.example.yaml`                       |
| 6 | Tests: purpose typing, empty-default merge, validation rejection                     | `src/prompts/registry.test.ts`, `src/config/templates-loader.test.ts` |

## 5. Out of scope (later tickets)

- ~~NSFW LLM classifier consumer wiring (~~ `src/nsfw/moderation-service.ts` ~~)~~ — **done 2026-08-04** (`nsfw.useLlmClassifier` + `NsfwHook` LLM path)
- `{{var}}` interpolation for LLM prompts
- `chatFormats` consumer (chat formatting path)
- Legacy purpose removal/retirement
- Chat _setup_ template lifecycle (`FEAT-chat-template-config-lifecycle.md`) — separate domain

## 6. Risks / notes

- Import layering kept: `config/sections/templates.ts` must NOT import `src/prompts/registry.ts` (cycle/layering). Defaults stay in the registry; config stays override-only.
- `templates-loader.test.ts` and `registry.test.ts` will need updates — they assert the current four-key defaults.
- No schema regeneration required (no DB migration).
- `bun run check` gate: this task touches only `src/` + docs — expect same 15/17 baseline (lint-ts + size-strict remain pre-existing debt).
