<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: insertUnique probe misreports skip as inserted when conflict target includes id

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** insertunique probe misreports skip as inserted when conflict
**Context:** Context: 3b361a1a4.
**Acceptance Criteria:** skip the probe and honor numInsertedOrUpdatedRows when conflictColumns includes 'id'.

## Summary

Context: 3b361a1a4. Severity: medium (latent — sole caller register.ts passes ['username']). db/upsert-helpers.ts:216-238: on the numInsertedOrUpdatedRows=0 skip path the probe SELECTs by conflict columns and compares probeRow.id to values.id; when conflictColumns contains 'id' the probe finds the PRE-EXISTING conflicting row at insertedId → returns 'inserted' for a genuine skip. Repro: insertUnique with conflictColumns ['id'] and a duplicate id. Fix: skip the probe and honor numInsertedOrUpdatedRows when conflictColumns includes 'id'.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
