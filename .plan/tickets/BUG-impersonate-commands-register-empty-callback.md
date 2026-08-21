<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: impersonate command register callbacks are empty (no-op)

**Status:** Open
**Priority:** high
**Effort:** Small
**Area:** impersonation
**Source:** reconcile review (Scout Batch C — IMP-2)

## Evidence

`src/assistant/commands/impersonate.ts:38-47` — both `registerCommand` callbacks return `buildImpersonateResult(args, usageMsg)` but the callback body is empty — the `args` parameter is never used, no state is emitted to the caller.

## Impact

Commands register but produce no visible effect; user sees no response to `/impersonate foo`.

## Fix

Populate the callback or inline the logic. The `actionPayload` returned by `buildImpersonateResult` needs to be dispatched through the chat action system. See IMP-3.

## Verification

- E2E: fire `/impersonate Eldon` → response visible in chat.
- E2E: fire `/char Eldon` → response visible in chat.

## Acceptance Criteria

- [ ] Both commands produce a visible chat response
- [ ] Response includes the impersonation character name
