<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# WIRE: impersonate command-palette FE has no actionPayload dispatch
**Priority Tier:** P2
**Effort:** Medium
**Source:** reconcile review (Scout Batch C — IMP-3)
`src/frontend/alpine/command-buttons.ts:73-92` — `runCommand(cmd)` handles only `"guide"` and `"scene"`. When `cmd === "impersonate"` or `"char"`, it falls through to `input.value = \`/${cmd} \` (types into chat input). The `actionPayload` from `buildImpersonateResult` is never read, never dispatched.
User sees `/impersonate Eldon` typed into the chat input instead of actual impersonation. The impersonation flow is completely dead on the FE side.
```ts
if (cmd === "impersonate" || cmd === "char") {
  Alpine.store("chat").impersonate(cmd);
  return;
}
```

And add `impersonate(cmd)` method to the chat Alpine store that calls the BE impersonate endpoint.

## Verification

- Playwright: click impersonate button → actionPayload dispatched, not text typed.
- E2E: full impersonation flow (IMP-1 + IMP-2 + this) end-to-end.

## Acceptance Criteria

- [ ] Impersonate button dispatches actionPayload, not text input
- [ ] Chat store has `impersonate()` method

## Resolution

Fixed in commit `2ac5cf29` (fix(wire): 3 P2-Reconcile tickets): the same commit also wrapped /views/nsfw-moderation in `requirePermission('admin.system')` guard, added the impersonate dispatch in `command-buttons.runCommand`, and added the linkAsset() call in `src/routes/characters/create.ts` after actor insert.