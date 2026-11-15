<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: System prompts sufficiency and extensibility

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Epic:** epic-config-templates
**Related:** `TASK-prompt-template-registry.md`, `.plan/epics/epic-classifier-template-packs.md`, `.plan/epics/epic-context-injection-templates.md`

**Summary:**

22 typed prompt purposes (`PROMPT_PURPOSES`) are registered and in lockstep with `LLM_PROMPT_DEFAULTS` (verified by execution); the remaining gaps are the image-prompt path (hardcoded, `imagePrompt` default dormant), the `merge` path (purpose unregistered, hardcoded fallback), the `LlmSystemPrompts` interface (8 shipped purposes have no named entry), plus no i18n and no prompt versioning.

Source: system-prompts research pass, `.tmp/research/Research-system-prompts.md` in the repo-root checkout (gitignored; its findings are recorded verbatim here and re-verified against the code — the source doc's §4 gap list is partly stale, see the Context section).

**Context:**

Source: research pass over `src/prompts/`, the prompt assembler, and the
aux/image prompt templates (docs-only, no code edits). Findings below are
re-verified against the code; two claims in the source doc were stale and are
corrected here (the purpose count, and the "missing purposes" claim — which
applies to the `LlmSystemPrompts` interface only; every aux purpose is in fact
already registered with a default). File:line evidence:

1. **The `"merge"` purpose is unregistered.** `src/chat/service/merge/merge-llm.ts:30`
   calls `resolveSystemPrompt(config.templates.llm, "merge")` and falls back to
   `MERGE_SYSTEM_PROMPT_FALLBACK` (`:18`). But `"merge"` is absent from
   `PROMPT_PURPOSES` (`src/prompts/purposes.ts:17-40`) and from
   `LLM_PROMPT_DEFAULTS` (`src/prompts/registry.ts:67-112`). A config override
   only works through the `[key: string]` index signature on
   `LlmSystemPrompts` (`packages/core/src/config/sections/templates.ts:51`) —
   no code default, no typed entry.
2. **Image-prompt system prompts are hardcoded and bypass the registry.**
   `src/generation/prompt-templates/messages.ts:21-68` (`systemPromptForFamily`)
   and `:76-89` (`buildImageSystemPrompt`) build the prompt inline from
   `profile.promptFormat`/`detail`/`maxTokenHint`. The `imagePrompt` purpose
   exists in `PROMPT_PURPOSES` and `LLM_PROMPT_DEFAULTS` but no call site
   resolves it — the default is dormant and the prompt engineering is
   duplicated.
3. **`LlmSystemPrompts` omits shipped purposes.** The interface
   (`packages/core/src/config/sections/templates.ts:21-52`) names 14 purposes:
   chat, summarize, imagePrompt, ooc, assistant, gm, nsfw, nsfwPolicy, vn,
   vnChoices, vnQuestions, transition, intent, memory. The 8 shipped purposes
   with NO named entry — `nsfwPolicySfw`, `gmTool`, `moderation`,
   `injectionCheck`, `carriage`, `promptAnalysis`, `chatTitle`, `ragAsk` — are
   reachable only through the `[key: string]` index signature
   (`templates.ts:51`). `merge` has no entry and no default at all.
   Autocomplete/discoverability gap for config authors.
4. **No i18n for prompt strings.** All prompts are English literals in TS;
   the locale catalogs (`src/public/locales/*.json`, 10 languages) cover UI
   chrome only — no system-prompt text is keyed for translation, and the
   i18n-keys gate (`scripts/check/i18n-keys.mjs`) only checks `t()` call sites
   in `src/`. English-only is acceptable today but should be an explicit,
   documented decision.
5. **No prompt versioning.** `resolveSystemPrompt` returns a bare string — no
   version/hash/source metadata, so an override cannot be audited or rolled
   back.
6. **No centralized fallback policy.** `resolveSystemPrompt` returns `""` when
   neither override nor default exists (`src/prompts/registry.ts:132`); each
   consumer must guard the empty string itself (merge does, via `|| fallback`).

Scope note: this ticket covers the *registry/completeness* gaps (1-3) plus the
explicit decisions for 4-6. It does NOT build the classifier template-pack
feature — that is `epic-classifier-template-packs.md` Phase 2/3 (user-supplied
packs + decision-model transport), whose own Phase 1 ("add the missing prompt
purposes") has already landed: `src/aux-pipeline/template-registry.ts`
(`AUX_CLASSIFICATION_TASKS`), `src/aux-pipeline/class-template-resolver.ts`,
`packages/core/src/config/sections/templates-classifiers.ts` and
`configs/templates/classifiers/` all exist, and every aux purpose listed in
finding 3's second list is already a registered purpose with a default. What
remains for the *typed-interface* half is only `LlmSystemPrompts` (finding 3).
Do not re-file the purpose-registration work — it is done.

Related: `TASK-prompt-template-registry.md` (shipped registry hardening),
`.plan/epics/epic-config-templates.md` (LLM prompt registry domain),
`.plan/epics/epic-classifier-template-packs.md` (Phase 1 purpose registration),
`.plan/epics/epic-context-injection-templates.md` (registry inventory).

Constraints:
- `LlmSystemPrompts` must keep its `[key: string]` index signature — custom
  user purposes (`systemPrompts.<custom>` in `configs/templates/llm.yaml`)
  must stay legal.
- `LLM_PROMPT_DEFAULTS` in `src/prompts/registry.ts` stays the single source
  of truth for defaults; the config layer stays user-overrides-only.
- Routing the image path through the registry must not lose the per-family
  `promptFormat` / `detail` / `maxTokenHint` shaping — a single flat default
  string cannot express four output formats (tags / natural / tags-and-natural
  / json) plus three detail levels. Keep the structured builder as the
  default and let a config override replace it wholesale.
- Do not change any shipped prompt text in this ticket; registration only.

**Acceptance Criteria:**

- [ ] `"merge"` is registered in `PROMPT_PURPOSES` and has a default in
      `LLM_PROMPT_DEFAULTS`; `resolveMergeSystemPrompt` still returns a
      non-empty prompt when neither config nor default is present
- [ ] the SD image-prompt path resolves through `resolveSystemPrompt(...,
      "imagePrompt")`, with the existing per-family builder kept as the
      structured default and as the last-resort fallback
- [ ] `LlmSystemPrompts` gains named optional entries for every shipped
      purpose (`nsfwPolicySfw`, `gmTool`, `moderation`, `injectionCheck`,
      `carriage`, `promptAnalysis`, `chatTitle`, `ragAsk`, `merge`) while
      keeping the `[key: string]` index signature for custom purposes
- [ ] the existing `PROMPT_PURPOSES` / `LLM_PROMPT_DEFAULTS` lockstep test
      (`src/prompts/registry.test.ts:33-43`) still passes after `merge` is added
      to both lists — i.e. `merge` is registered in BOTH, not just one
- [ ] i18n and versioning are each resolved as an explicit decision recorded
      in this ticket (implemented, or documented as deliberately out of scope
      with the reason)
- [ ] fallback behaviour for an empty resolution is defined in one place
      (a shared fallback resolver or a documented per-call-site rule), so no
      consumer can reach an LLM call with an empty system prompt — today
      `resolveSystemPrompt` returns `""` for an unknown purpose
      (`src/prompts/registry.ts:132`, asserted at `registry.test.ts:95`) and
      callers guard individually (`merge-llm.ts:30` `|| FALLBACK`;
      `build-prompt.ts:97` passes `systemPromptFallback`, which the system
      section consumes at `src/assistant/prompt/sections/system.ts:95-96` and
      can still be `""`)
- [ ] unit tests cover: custom purpose still resolves; `merge` default
      resolves; image path honours a config override
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
