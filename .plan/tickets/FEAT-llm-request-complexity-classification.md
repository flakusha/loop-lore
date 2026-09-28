<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: LLM request complexity classification and priority derivation

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** Classifies each queued LLM request into a `requestClass` + complexity score and derives a `Priority` from it, so the scheduler orders by work weight rather than by arrival alone. Pure function, evaluated before queueing; no LLM call is made to classify.
**Context:** `ResourceManager.submit()` already takes a numeric `priority` and `PriorityLevel` already defines `High/Normal/Low` (`src/llm/resource-manager-types.ts:14-20`), but nothing in the codebase ever sets anything other than the default. This ticket supplies the value.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] A `requestClass` discriminator is added to the generation request contract with at least: `interactive-turn` (user is waiting), `auto-gen` (group cascade / GM beat), `aux` (aux-pipeline classification), `embedding`, `rerank`. Use a string-literal union + const object, matching the repo's `LLMProvider` / `LlmRequestState` convention — not a numeric status.
- [ ] Every dispatch call site sets its class explicitly. The call site already knows; the scheduler must not infer it from prompt content.
  - `src/generation/generate-route/handler.ts:57` → `interactive-turn`
  - `src/generation/auto-gen/call-llm.ts:89` → `auto-gen`
  - `src/aux-pipeline/runner.ts:134` → `aux`
  - `src/memory/embeddings.ts` → `embedding`
  - `src/memory/rerank.ts` → `rerank`
- [ ] Classification is a **pure function** `classifyRequest(req) → { class, complexity, priority }` in its own module under `src/llm/`. Deterministic, no I/O, no LLM call, no clock read.
- [ ] Complexity reuses the existing `estimateTokens` from `src/chat/token-utils.ts`. A second token estimator is explicitly out of scope — reuse or nothing.
- [ ] Priority derivation is deterministic and total: every `requestClass` × complexity bucket maps to a defined `Priority`. No `undefined` priority reaches `submit()`.
- [ ] Default class ordering is documented in the module header and is defensible: interactive-turn outranks auto-gen, which outranks aux/embedding/rerank background work. Complexity breaks ties *within* a class, not across the class boundary — a 32k scene does not outrank a waiting user.
- [ ] Unit tests cover: each class's priority, complexity monotonicity within a class (bigger prompt ⇒ not-lower priority), the pure-function property (same input ⇒ same output), and the default priority when a call site omits the class.
- [ ] `bun run check` green, including the 80% per-module coverage floor for the new module.

## Notes

**The deadlock rule.** Classification must never require an LLM call. A scheduler that spends an LLM call to decide whether to make an LLM call doubles its own cost and can starve itself. Every signal used here (class, prompt size, requested output budget) is known locally before dispatch.

**Why explicit class beats inference.** The five call sites already know what they are. Inferring "this looks like a classifier" from prompt shape means either a heuristic that misfires on a user's roleplay prompt that happens to end in a question, or a round-trip. Both are worse than a field on the call.

**Complexity within a class is about slot occupancy, not importance.** A long request holds a slot longer, so it should start earlier among equals — not jump the queue past a waiting user. That distinction is the whole reason class dominates complexity in the derivation.

## Related Files

- `src/llm/` — new `classify.ts` module lives here
- `src/llm/resource-manager-types.ts:14-20` — `PriorityLevel` being populated
- `src/chat/token-utils.ts` — `estimateTokens` being reused
- `src/generation/generate-route/handler.ts`, `src/generation/auto-gen/call-llm.ts`, `src/aux-pipeline/runner.ts`, `src/memory/embeddings.ts`, `src/memory/rerank.ts` — call sites
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 27f9dd5
