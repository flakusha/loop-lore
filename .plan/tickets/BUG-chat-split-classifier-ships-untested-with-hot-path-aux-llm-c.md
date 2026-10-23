<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: chat split-classifier ships untested with hot-path aux LLM call against own scope

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** conversation-branching
**Related:** `FEAT-classifier-template-packs-user-config.md` (classifier templates the split-classifier consumes), `TASK-TRANSITION-AUX-LLM-FALLBACK.md` (intended separate aux-classification scope)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

chat-branch-regex-detect: (a) new src/chat/split-classifier.ts ships with zero tests (no test file imports classifySplitIntent; aux-JSON gating :37-44, null-response path, fallback {false,false,none} unexercised; violates >=80pct new-module coverage gate); (b) wiring in handle-scene-transitions.ts:99-106 classifies every user message and on regex miss runs callAux (role+provider DB resolves, scheduler submit, LLM roundtrip, 2s hard timeout runner.ts:30) purely to emit an info log line, against the branch's own declared scope (commit 960855157 and plan text: regex-only slice, aux classification in a separate ticket; TASK-TRANSITION-AUX-LLM-FALLBACK documents the intended separate scope). Also: near-dead silent catch :49-52 (callAux returns null on all failures; jsonParseOr never throws), dead _recentMessages param (sole caller passes []), missing requireActorExists guard on exported fn (sibling classifyTransitionMessage has it; not exploitable today since sole caller is access-checked at create.ts:64).

Evidence: features section 4; split-detect.test.ts + split.test.ts 10 pass but never load the classifier.

Affected: branch chat-branch-regex-detect; files src/chat/split-classifier.ts:20,33-35,37-44,49-52; src/chat/service/split.ts:226-248; src/chat/scene/handle-scene-transitions.ts:99-106; src/routes/chats/create.ts:232.

Fix direction: add src/chat/split-classifier.test.ts pinning (a) regex hit returns source:regex without calling aux, (b) aux returns isSplit JSON parsed, (c) aux null/garbage/non-boolean to fallback; decide hot-path design (remove aux call from per-message path or gate/queue it) consistent with the declared regex-only scope; drop try/catch or log warn with error; remove dead param; add requireActorExists before reuse.

Acceptance Criteria:

- [ ] split-classifier.test.ts covers regex-hit, aux-parse, null/garbage fallback at >=80pct line coverage
- [ ] per-message hot path has no blocking aux LLM roundtrip unless explicitly scoped, or the scope decision is recorded
- [ ] scoped suites green

Report: .tmp/glm-review/2026-10-21/features.md section 4.

Caveats: hot-path latency/cost; BYO-key authorization parity for future reuse; TOCTOU n/a; partial failure must degrade to fallback; observability: keep detect-and-log visibility.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
