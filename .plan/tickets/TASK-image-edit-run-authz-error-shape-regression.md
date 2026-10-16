<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Image-edit run route — authz + error-shape regression cover

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** `epic-reference-conditioned-generation`
**Related:** `epic-comfyui-plugin.md`, `TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per.md`, `TASK-comfyui-template-parameter-validation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`epic-comfyui-plugin.md` lists two Phase 0/1 items as open that the code already
appears to satisfy. Close the gap between the checklist and reality by **proving**
it with regression cover — the checklist entries stay as the authoritative record
until this ticket lands.

## Context

`epic-comfyui-plugin.md` Phase 0 has:

- "**Authz** `handleRun` (`routes.ts:61`, bare `Request`, no caller): require
  `userId` + `checkChatAccess` on `chatId` — `handleImageGeneration` parity (IDOR
  write open today)."
- Phase 1: "`POST /api/v1/image-edit/run` error-shape + regression coverage (authz per
  Phase 0)".

**Read the code before believing either line.** As of 2026-10-16:

- `handleRun` (`src/image-edit/routes.ts:74`) takes an `opts?: HandleRunAuth` and
  calls `authorizeRunLinkage(body, opts ?? {})` at `:78`.
- `authorizeRunLinkage` (`src/image-edit/run-authz.ts:25-53`) returns 401 with no
  `userId`, and runs `checkChatAccess` for both `chatId` and `messageId`.
- `imageEditRoutes` (`src/image-edit/routes.ts:247-253`) derives `userId` /
  `userRole` from the request context and forwards them, so the mounted route is
  not weaker than the handler.
- `src/image-edit/routes.coverage.test.ts:304-351` already asserts 401 unauth, 403
  foreign `chatId`, 403 foreign `messageId`, 403 unknown `messageId`.
- Stale `/api/image-edit/*` doc comments: **none remain** — the file carries no
  match for `/api/image-edit`.
- Persistence: `ComfyUIEditProvider.execute` calls `createAsset` with
  `ownerId: opts.ownerId` (`comfyui-provider.ts:166-172`) and `linkAsset` for
  chat/message (`:185-197`); `BUG-comfyui-edit-provider-persists-nothing-ownerid-system-violat.md`
  is **Done** and `src/image-edit/providers/comfyui-owner.test.ts` pins it.
- Error shapes are covered in `routes.coverage.test.ts:353-498`: 400 unparseable
  body, 400 missing `template_id`, 400 missing `backend`, 404 unknown template, 400
  wrong backend, 400 missing required params, 500 unreachable ComfyUI, 500
  unconfigured sd-server.

So both items look **done**. The problem is the record, not the code: an epic
checklist that says "IDOR write open" next to shipped authz will mislead the next
reader into either re-doing the work or trusting the gap. This ticket verifies
rather than assumes, and closes the record.

### Do not edit the epic's checklists from here

`epic-comfyui-plugin.md`'s phase checklists are the authoritative state record and
other work is in flight against them. This ticket's Context says so; it does not
rewrite them. Whoever flips those checkboxes is the ticket that lands the final
verification.

### One real gap this ticket does NOT own

`handleRun` checks required params with `if (p.required && !body.params[p.name])`
(`routes.ts:106`) — a falsy test, so a valid `steps: 0` or `enableHr: false` is
reported as missing, and declared `min`/`max`/`step` are never enforced. That is
`TASK-comfyui-template-parameter-validation.md` (Gap A / Gap A2), which already
owns it. Do not duplicate that fix here.

## Acceptance Criteria

- [ ] Every claim in the Context above is re-verified against the code at HEAD and
      any drift found is either fixed here or filed as its own ticket with a link
- [ ] The authz invariants stay pinned: 401 unauthenticated, 403 foreign `chatId`,
      403 foreign `messageId`, 403 unknown `messageId`, 403 unknown `chatId`
- [ ] The error-shape matrix for `POST /api/v1/image-edit/run` is complete and
      asserted — every status the handler can return, in the shared `jsonError` /
      `jsonResponse` envelope, including the 401 and 403 paths
- [ ] One explicit assertion that the response never references an asset id that
      does not exist (the anti-dangling invariant `TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per.md`
      describes), since that ticket remains open
- [ ] Stale `/api/*` doc comments in `src/image-edit/` are absent (grep-verified)
      and a check exists so they cannot come back
- [ ] The epic's Phase 0 authz and Phase 1 error-shape items are shown to be either
      already satisfied or newly satisfied here, with evidence — the checklist is
      **not** edited by this ticket
- [ ] `bun run check` green
