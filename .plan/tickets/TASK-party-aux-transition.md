<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM Transition Detection Fallback

**Status:** ✅ Done 2026-08-01 (classifier + wiring); regression acceptance tracked here
**Priority:** P2-B
**Effort:** Medium
**Epic:** epic-chat-transfer-location
**Related:** TASK-travel-party-migration.md (umbrella), TASK-party-join-leave.md, TASK-chat-branch-merge.md

## Summary

Phase 2 of travel-party migration: AUX LLM fallback for transition intent
detection. Regex-based detection misses nuanced transitions; an AUX LLM provides
fallback classification under fast-resolution constraints.

## Context

The transition classifier landed as `src/chat/transition-classifier.ts`
(done 2026-08-01; see `TASK-transition-aux-llm-fallback.md`). It runs
regex-first, then AUX-LLM-fallback, wired into the message processing pipeline
with timeout and error handling. Constraints for the AUX call:

| Constraint      | Value                  | Reason                        |
| --------------- | ---------------------- | ----------------------------- |
| Context window  | Last 1-2 messages only | Minimize token cost           |
| Max tokens      | 50-100                 | Fast response, JSON parseable |
| Temperature     | 0.0                    | Deterministic classification  |
| Response format | JSON only              | Structured output             |
| Timeout         | 2s                     | Fail fast, don't block        |
| Fallback        | No transition          | Graceful degradation          |

## Implementation Plan

### Phase 2: AUX LLM Transition Fallback

- [x] Create `src/chat/transition-classifier.ts` — done 2026-08-01 (see `TASK-transition-aux-llm-fallback.md`)
- [x] Implement regex-first, AUX-LLM-fallback detection
- [x] Wire into message processing pipeline
- [x] Add timeout and error handling

## Acceptance Criteria

- [x] AUX LLM fallback detects transitions regex misses (Phase 2, done 2026-08-01)
- [x] AUX LLM fails fast (2s timeout) with graceful degradation
- [x] All existing chat tests still pass
