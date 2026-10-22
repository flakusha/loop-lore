<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Split/Reunite Aux (0-shot) Classification

**Summary:** Add an auxiliary LLM path to propose/clarify split/reunite branch specs from narration, mirroring `classifyTransition`.
**Status:** Not Started
**Priority:** P2-B
**Effort:** Medium
**Epic:** epic-chat-transfer-location
**Related:** TASK-chat-branch-merge.md

## Goal

**Context:** Aux LLM path for split/reunite branch specs, mirroring `classifyTransition`; separate from regex detection to keep verification/rollback surfaces distinct.

**Acceptance Criteria:** See the acceptance criteria below.

Use aux LLM to derive branch specs (locations + actor sets) and secondary chat id from user narration, then validate and execute split/reunite. Separate from regex detection (shipped) to keep verification/rollback surfaces distinct.

## Acceptance Criteria

- Aux classifier returns structured branch specs or null.
- Validation guards (owner, participants, locations) before execution.
- Tests cover parse + fallback.
