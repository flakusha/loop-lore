<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: check report `name` field dropped

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Audit found scripts/check-parallel.mjs output omits the per-check `name` field in the JSON report. Restore or add a top-level `name` for grep/scorecard tooling. See audit .tmp/audit/batch-B-config-size.md finding LOW.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
