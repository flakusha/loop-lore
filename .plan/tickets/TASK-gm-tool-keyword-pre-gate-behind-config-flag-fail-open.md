<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: gm-tool keyword pre-gate behind config flag (fail-open)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-deterministic-first-gates
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

First ticket of epic-deterministic-first-gates.md. gm-tool detection sends EVERY non-slash message in GM-mode chats to the AUX LLM (`src/assistant/gm-tool-detection.ts:104-143`, awaited pre-insert `src/routes/messages/create.ts:142-151`) with no keyword pre-filter and no cache. The correct in-repo pattern exists one directory over: regex-first `src/chat/transition-classifier.ts:7-9`. Boundaries: gm-tool wiring itself is Done (`ecde333`); EPIC-AUX (epic-aux-enrichment-pipeline.md, M1-M6) owns call *policy*, not call *count*; `a850d57` (kNN classifier backend) is complementary — this gate sits upstream of any classifier; EPIC-LLM-REQUEST-SCHEDULER (`04ef186`) admits requests after creation, does not eliminate calls. Coverage: `giwt search "prompt cache"/"prefix cache"/"response cache"` -> no matches for the classifier result-cache scope.

Epic: epic-deterministic-first-gates.md. Shares the epic with: shared candidate-gate helper (intent + gm-tool), short-TTL (chatId, content-hash) classifier result cache, per-task gate/LLM-call/skip counters on the existing aux telemetry.

## Summary

Keyword gate on the gm-tool tool-name vocabulary (dice/stats/summarize/create — GM_TOOL_NAMES, `gm-tool-detection.ts:28-37`); gate says "skip" -> no AUX call; "possible tool" -> AUX runs (fail-open). Telemetry counters per the `src/regex/telemetry.ts:5-10` pattern make call-reduction auditable.

## Acceptance Criteria

- [ ] Gate marks "candidate" for every gm-tool fixture in `src/aux-pipeline/eval/corpus.ts` (no regressions vs `baseline.json` gm-tool accuracy 1.0).
- [ ] Gate marks "skip" for a new non-tool fixture set committed alongside (>= 15 ordinary RP prose messages, including dialogue containing dice-adjacent words like "d20" only in fiction).
- [ ] With the gate seeded from fixtures, the DI `detect` seam (`gm-tool-execution.ts:67`) proves `detectGmTool` is NOT called for skip-verdicts and still called for candidate-verdicts.
- [ ] Config flag fails open (gate error => AUX call proceeds); default-on documented.
- [ ] Gate verdicts counted per call via the `src/regex/telemetry.ts` counter pattern, visible in the admin aux telemetry endpoint.

## Caveats

- [ ] False negatives must fail open: worst case is today behavior (AUX always runs).
- [ ] Coordination: fixtures reuse the existing corpus format, coordinated with `e1db6df` label fixes.
- [ ] Observability: skip/candidate counters are the acceptance metric.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
