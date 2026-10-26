<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: translate-only providers ride general failover chains; complete() returns a translation as a successful turn (incl. merge-LLM path)

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Translate-only providers (deepl/libretranslate/googleTranslate) ride general failover chains; `complete()` echoes a translation as a "successful" turn; the merge-LLM path inherits the same unfiltered chain (F-2 + F-10).

**Files:**

- src/generation/providers/registry.ts:209-222 (deepl/libretranslate/googleTranslate appended to any primary's failover list)
- src/generation/providers/call-with-failover.ts:79-99 (no modality/capability gate in dispatch loop)
- src/generation/providers/deepl/core.ts:34-73 + translate-shim.ts:20-27 (`complete()` = translate last user message into `req.model`)
- consumers: src/generation/auto-gen/call-llm.ts:164,189,238; src/chat/service/merge/merge-llm-call.ts:60

**Evidence:**

- All three translate providers declare `capabilities.text: true` (deepl/index.test.ts:73, google-translate/index.test.ts:72, libretranslate/index.test.ts:44), so the router treats them as text-capable. `buildFailoverList` unconditionally appends them after general LLM providers; `callWithFailover` calls `prov.complete(attempt)` with the chat request unchanged. DeepL's dispatcher maps any request to "translate the last user message into `req.model`", falls back to `state.defaultModel` when model is empty (core.ts:38), and returns `finishReason: "stop"` → `circuitBreaker.onSuccess` → the machine-translated prompt is returned as assistant content (review-core.md F-2).
- Merge path calls `callWithFailover(failoverList, req)` with a list built from config (no signal → no capability routing), so merge summaries are also dispatchable to translate-only providers (review-core.md F-10).

**Fix:**

Modality gate — tag providers chat-capable vs translate-only and filter in `buildFailoverList` + `callWithFailover` dispatch. One gate closes both F-2 and F-10.

**Related:** b104dd8 (image/audio BYO failover — failover mechanism only, different defect).

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-2 + F-10.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 7f09e86 (registry tip: e3a177854 Konstantin Fedotov Close issue)
