<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fuzzing runtime harness (tests/fuzz/: harness, corpus, mutation engine, CI)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fuzzing-infrastructure

**Summary:**

Only generation landed (scripts/generate-schema-fuzz.ts). The epic's runtime infrastructure is absent: no tests/fuzz/ directory, no harness, no corpus, no mutation engine, no CI wiring.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] tests/fuzz/ harness with a documented entrypoint runnable in CI.
- [ ] Seed corpus + mutation engine (or adopt an existing tool) for the priority input categories from the epic.
- [ ] At least one wired target (e.g. route body schemas) producing reproducible crashes.
- [ ] CI gate step added (may start advisory).
- [ ] bun run check green.

**Related:** scripts/generate-schema-fuzz.ts, .plan/epics/epic-fuzzing-infrastructure.md
