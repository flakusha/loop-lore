<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: impersonate buildImpersonateResult ReferenceError on undefined `target`

**Status:** Open
**Priority:** high
**Effort:** Small
**Area:** impersonation
**Source:** reconcile review (Scout Batch C — IMP-1)

## Evidence

`src/assistant/commands/impersonate.ts:10-25` — `function buildImpersonateResult(args, usageMsg)` references `target` at L21 which is never declared. `args` parameter is unused inside the function body — `target = args.join(...)` assignment is missing.

```ts
function buildImpersonateResult(args: string[], usageMsg: string) {
  // args is never used — target never assigned
  const charName = target.split("/")[0]; // ReferenceError: target is not defined
  return { systemMessage: { ... } };
}
```

## Impact

Registration-time ReferenceError when any user fires `/impersonate` or `/char`; entire impersonation flow dead at runtime.

## Fix

```ts
function buildImpersonateResult(args: string[], usageMsg: string) {
  const target = args.join(" ").toLowerCase();
  const charName = target.split("/")[0];
  ...
}
```

## Verification

- Unit test: call `buildImpersonateResult(["Eldon", "friendly"], ...)` → no throw, charName === "eldon".
- E2E: fire `/impersonate Eldon` in a chat → no console error.

## Acceptance Criteria

- [ ] `buildImpersonateResult` no ReferenceError
- [ ] `charName` correctly parsed from args
- [ ] Existing impersonation tests pass
