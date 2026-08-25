<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ctx Token Accuracy

**Status**: open
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-chat-context-optimization
**Related**:

## Summary

Golden tests: token estimates vs tiktoken ground truth; budget enforcement boundaries

## Acceptance

- [ ] Complete

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B3:** Token counter uses generic `defaultTokenCount` in `src/chat/token-counter.ts`; no per-model mapping → inaccurate context-window budgeting across model families.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
