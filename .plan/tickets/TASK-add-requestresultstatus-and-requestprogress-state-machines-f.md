<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add RequestResultStatus and RequestProgress state machines for request_results

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle

## Summary

Replace string-typed status/progress fields in request_results table with strictly typed state machines. RequestResultStatus: pending→in_progress→complete/failed/expired. RequestProgress: waiting→processing→paused→done. The 067_request_results.ts migration already defines the lifecycle. Must create src/db/enums-core/request-result.ts with StateDef + createMachine + CompositeValidator, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
