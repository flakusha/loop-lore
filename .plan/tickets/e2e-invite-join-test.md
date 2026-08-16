<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Ticket: E2E Invite/Flow Validation

## Description

Create comprehensive E2E tests for invitation and join flows to cover missing test coverage identified in audit.

## Priority

high

## Related Epics

invitation-system

## Test Scenarios

1. Valid invitation code acceptance
2. Expired invitation code rejection
3. Used invitation code rejection
4. Invalid invitation code rejection
5. Join flow with proper participant permissions
6. Cross-user isolation (User B cannot use User A's invite)

## Files to Create

- tests/e2e/flows/invite-join.test.ts
