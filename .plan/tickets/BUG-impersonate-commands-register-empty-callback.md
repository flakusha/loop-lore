<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: impersonate command register callbacks are empty (no-op)

**Status:** Not A Bug — Already Correct
**Priority:** high
**Priority Tier:** P2
**Effort:** Small
**Area:** impersonation
**Source:** reconcile review (Scout Batch C — IMP-2)
**Resolved:** 2026-08-21

## Resolution

The callbacks ARE NOT empty. `buildImpersonateResult` returns a `CommandResult` object
with `systemMessage`, `action`, `actionPayload`, and `handled: true`. The return value
is the command response — this IS the visible effect.

Current code (`src/assistant/commands/impersonate.ts:38-47`):

```ts
registerCommand("impersonate", (args,): CommandResult => {
  return buildImpersonateResult(
    args,
    "Usage: /impersonate <character_name> ...",
  );
},);
```

The return value is the command result — the command system dispatches it. No fix required.

## Note on IMP-3 (WIRE)

If `/impersonate` does not produce a visible chat response, the issue is in the
frontend dispatch of `actionPayload`/`action`, NOT in the command callback itself.
See `WIRE-IMPERSONATE-COMMAND-PALETTE-NO-ACTIONPAYLOAD-DISPATCH`.
