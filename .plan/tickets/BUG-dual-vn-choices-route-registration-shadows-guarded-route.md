<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: dual vn-choices route registration shadows guarded route

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Small

## Resolution

Fixed in `fix-batch-vn-assets-fe` (commit pending). The legacy owner-only registration is removed:

- `src/app/register-plugins.ts`: deleted `import { vnChoiceRoutes } from "../routes/vn-choices"` and `app.use(vnChoiceRoutes({ database: handleOpts.database }))`.
- Deleted `src/routes/vn-choices.ts` + `src/routes/vn-choices.test.ts` (legacy owner-only handler + its test; sole importer was register-plugins.ts — verified via `ctx_search`, no other importer exists).
- The guarded `src/routes/chats/vn-choices.ts` (participant-gated via `checkChatAccess`), mounted inside `chatsRoutes` at `/api/v1/chats/:id/vn-choices`, is now the single live handler.
- Also deleted dead mock `src/assistant/sd.ts` (zero production callers — `image-engine/index.ts` `generateImages` is a different module; grep verified).

Test: `src/routes/chats/vn-choices.test.ts` — mounts `chatsRoutes` with `/api/v1` prefix; participant lists (200), non-participant 404 (`checkChatAccess` not_found), and an unversioned `/api/chats/:id/vn-choices` mount returns 404 for an outsider (proving no owner-only duplicate). 15/15 pass, typecheck EXIT=0, dprint clean.

## Summary

register-plugins.ts:182 mounts new checkChatAccess-guarded src/routes/chats/vn-choices.ts; :187 mounts legacy src/routes/vn-choices.ts (owner-only, {data} shape, 409 on re-select). Repo comment (112-113): later registrations shadow earlier. Runtime: legacy wins; guarded route + its IDOR fix dead; non-owner participants locked out. Fix: remove one registration, align guard to participant semantics, add a route-mount test asserting the live handler.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
