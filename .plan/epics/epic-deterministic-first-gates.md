<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Deterministic-First Decision Gates for the Message Hot Path

**Effort:** Small
**Type:** epic
**Tags:** classifier, aux, deterministic-first, latency, caching
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High

## Summary

The one principle loop-lore genuinely violates today: two unconditional AUX LLM calls per message cycle — gm-tool detection on every non-slash GM-chat message (`src/routes/messages/create.ts:142-151`, detection at `src/assistant/gm-tool-detection.ts:104-143`) and `classifyIntent` on every generated message (`src/generation/auto-gen/call-llm.ts:112-116`) — with no pre-gate and no dedup, even though the in-repo regex-first pattern exists (`src/chat/transition-classifier.ts:7-9`). Bounded blast radius, immediate latency benefit on the most user-visible path, fully measurable with existing telemetry surfaces.

## Scope

- (a) Keyword/regex pre-gate for gm-tool detection (fail-open: "possible tool" → AUX runs).
- (b) Shared candidate-gate helper reused by intent + gm-tool.
- (c) Short-TTL identical-input classifier result cache (chatId + content hash).
- (d) Per-task gate/LLM-call/skip counters on the existing aux telemetry.

## Related Epics / Boundaries

- `ecde333` (Done) — gm-tool wiring only; no open work on call volume, gating, or caching.
- EPIC-AUX-ENRICHMENT-PIPELINE (`epic-aux-enrichment-pipeline.md`, `a850d57` embedding-kNN classifier is a complementary *backend*, upstream of this gate) — owns call *policy*, not call *count*; no gating/caching milestones.
- EPIC-LLM-REQUEST-SCHEDULER (`04ef186`) — orders/admits requests after they are created; does not eliminate calls.

## Tickets

- `TASK-gm-tool-keyword-pre-gate-behind-config-flag-fail-open` (`d42f8a3`, High) — first ticket with the 5 acceptance criteria from the business-use research doc.

## Open Questions

None blocking from the research doc (gate false-negatives fail open by design; worst case is today's behavior).
