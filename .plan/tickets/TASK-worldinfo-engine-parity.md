<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Worldinfo Engine Parity

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Summary:** Bring the World Info / lorebook engine to feature parity with the SillyTavern-style reference implementation that already lives in docs/spec/worldinfo-engine.md: scan_depth, recursive scanning, AND/OR key groups, activation chance, regex keys, sticky/timed/cooldown entries, character-card binding, world-book-vs-character-book precedence, and lore-distribution budgets.
**Context:** `TASK-cross-tool-data-portability-review.md` identified the gap. Loop-lore's lorebook activation conditions (FEAT-055) shipped 2026-08-21 (regex keys, AND/OR key_groups, scan_depth, activation_chance, priority weighting, migration 050_lorebook_activation.ts); parity task is the engine-level unification: a single `loreEntryMatch(entry, context) -> { activated, weight, ttl }` predicate shared between pre-prompt injection and runtime rules.

**Status**: Not Started
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**:
**Related**: TASK-cross-tool-data-portability-review.md

## Summary

Referenced from `TASK-cross-tool-data-portability-review.md`. See epic for details.

**Acceptance Criteria:**
- [ ] Complete
