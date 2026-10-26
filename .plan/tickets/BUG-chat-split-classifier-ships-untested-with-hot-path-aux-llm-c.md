<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: chat split-classifier ships untested with hot-path aux LLM call against own scope

**Status:** Done
**Status Note:** [2026-10-26 final pass] NOT-FIXED — unchanged by this pass, no partial edits left behind. Verified against the current tree: `src/chat/split-classifier.ts` still exists with no colocated test (no `src/chat/split-classifier.test.ts`; no test file imports `classifySplitIntent`), so the aux-JSON gating and the null/garbage fallback remain unexercised. Nothing in src/chat was touched this pass, so the hot-path decision (drop the per-message aux roundtrip or record the scope decision) is still open and needs its own slice: add `src/chat/split-classifier.test.ts` modelled on `src/chat/split.test.ts` (regex hit returns `source: regex` without calling aux; aux JSON parsed; null/garbage/non-boolean falls back to `{false,false,none}`), then decide the wiring in `src/chat/scene/handle-scene-transitions.ts`. This ticket must not be closed on the sibling fixes in this pass.

**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue e20f01c): No split-classifier test file exists repo-wide; the project's own baseline still lists it as an uncovered gap (scripts/check/test-gaps-baseline.json:227, src/chat/split-classifier.ts#classifySplitIntent). Hot path unchanged: handle-scene-transitions.ts:99 awaits classifySplitIntent per user message with a blocking aux LLM roundtrip on regex miss (split-classifier.ts:34-38); no scope decision recorded in code.
**Status Note:** [2026-10-26 final pass] FIXED (issue e20f01c). Hot-path decision: GATE, not drop — `classifySplitIntent` now takes `opts.allowAux` (default `false`), so `src/routes/messages/handle-scene-transitions.ts:103` calls it with no opts and gets the regex verdict only. No second blocking aux roundtrip (2s cap: `src/aux-pipeline/runner.ts:31` default, applied at `:190`) on a message that already pays one in `classifyTransitionMessage` (`handle-scene-transitions.ts:112-118`). Gate chosen over dropping the call because the aux seam is the documented home of the separate slice (`TASK-transition-aux-llm-fallback.md`), and over a config flag because an operator switch for an advisory log line is more surface than an explicit argument; the scope decision is recorded in the module docs (`src/chat/split-classifier.ts:4-16`) and the call-site comment. Dead `_recentMessages` param removed; `userId` moved into the options bag (`src/chat/split-classifier.ts:31-39`). Near-dead silent catch replaced by a `log.warn` carrying the error message (`src/chat/split-classifier.ts:84-92`); `callAux` itself degrades to null, so the catch only guards a thrown call. `requireActorExists` item is obsolete: `src/routes/chats/create.ts` no longer takes or reuses a client `actorId` (grep: no matches). Tests: `src/chat/split-classifier.test.ts` (10 cases — regex split/reunite hit without an aux call, opt-in gate, aux `isSplit`/`isReunite`/negative verdict parsed, garbage/non-boolean/null aux → `{isSplit:false,isReunite:false,source:"none"}`, unregistered provider → fallback) driven through the real `callAux` policy (role resolution → scheduler → provider) with a registered stub provider, no `mock.module`. The call site itself had no test anywhere in the repo, so `src/routes/messages/handle-scene-transitions.test.ts` now pins the budget: a regex-miss user message spends exactly ONE aux roundtrip (the transition classifier's), and a control case shows the pre-fix wiring spent two on the same input. Evidence: `bun test src/chat/split-classifier.test.ts src/chat` 901 pass / 11 skip / 0 fail; `bun test src/routes/messages/handle-scene-transitions.test.ts` 3 pass (also green under `--isolate`); `handle-scene-transitions.test.ts` + `post.test.ts` + `create.coverage.test.ts` 37 pass, and the pre-existing route trio `post.test.ts` + `create.coverage.test.ts` + `command.test.ts` 42 pass — note none of the older route suites reach `handleSceneTransitions` (no import of it or of `post-insert.ts` anywhere in tests), which is why the colocated test exists; coverage `src/chat/split-classifier.ts` 100.00% funcs / 83.33% lines (uncovered lines 84,87-91 = the defensive catch, unreachable while `callAux` keeps its null-on-failure contract); `bun run test:gaps` OK with no new gaps and the baseline tightened via `test:gaps:update` (1407/1407), so `split-classifier.ts#classifySplitIntent` is no longer baselined. `bunx tsc --noEmit` clean across the whole project (an earlier run was blocked only by a peer's untracked `src/federation/remote-actor-document.test.ts`, since fixed). `bunx eslint` clean on all four changed files; the other gates that observe this surface are green too — `scripts/check-wiring.ts` OK (no orphaned service, advisory route-factory notes only), `scripts/check-changelog.ts` OK, `dead:code` + `dead:code:src` (knip) OK, and the advisory jscpd ratchet reports 3169 clones vs a 3228 baseline with the only clone touching this module being the pre-existing `isNew:false` 5-line import header. Behaviour narrowing accepted: on a regex miss the split/reunite info log no longer fires, because regex is the only detector left on this path — logged visibility is kept for every hit that remains detectable.

**Priority:** high
**Effort:** Medium
**Epic:** epic-conversation-branching
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

**Resolved:** 2026-10-26 registry-driven close: git issue e20f01c (registry tip: 6da574392 Konstantin Fedotov Close issue)
