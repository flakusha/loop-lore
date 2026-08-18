# TASK: Ownership-access control refactor

**Status:** ✅ Done (2026-08-18)
**Priority:** high
**Effort:** Medium

## Summary

Migrate per-resource ownership/role-bypass checks to permission-based guards. Replace inline admin/solo role comparisons (checkActorOwnership, chatAccess/checkChatAccess, requireWorldAccess/requireWorldOwner, checkQuestAccess, entity-routes checkOwnership, isChatOwner/isWorldOwner, and pure role gates in plugins/chats-templates/blog/telemetry/users-manage/sessions) with can(userRole, ...) using new admin.{chat,character,world} bypass perms + existing admin.{system,settings,users}. Adapts TASK-user-seeding-role-expansion backlog item (`ownership-access-control` worktree, merged to dev).

## Decision (user-approved)

- **Behavior-preserving default, matrix governs**: the three ownership-bypass perms added to the `Permission` union — `admin.character`, `admin.chat`, `admin.world` — are granted (only) to roles holding `"*"` (admin/solo/tester). No `DEFAULT_PERMISSIONS` change. Softening is a future matrix edit per role.
- **solo = admin-equivalent**: since solo holds `"*"`, it now bypasses the previously-admin-only ownership paths (characters update/remove, users manage delete, blog, plugins, chatAccess, requireWorldAccess, messages archiving, etc.). This is the accepted closing of the prior solo/admin inconsistency. Access-control denial tests now use a genuine `user`-role subject to keep asserting the contract; `/api/users/:id`-style gates and content-ownership checks grant solo.
- Bypass-perm names live under `admin.*` (NOT `chat.*`/`character.*`) so moderator's `chat.*` and creator's `character.*` wildcards do NOT silently widen them.

## Migrated surfaces (all backend role-literal checks → can())

- **Shared ownership helpers → can()**: actor-auth (checkActorOwnership), chat/service/access (checkChatAccess), chat-sections/access + chat-backgrounds/shared (chatAccess), worlds/access (requireWorldAccess/requireWorldOwner), quests/handlers (checkQuestAccess/checkWorldAccess), entity-routes/context (checkOwnership), world-invites (isWorldOwner), invites (isChatOwner), story-turns (checkChatOwnership), location-explorer (requireWorldAccess).
- **admin.system**: plugins.ts (3), telemetry.ts (5).
- **admin.users**: sessions.ts (3), users/manage.ts (4).
- **admin.settings**: chats/templates.ts (3), blog/moderation (2) + rag (1) + posts (2).
- **admin.chat**: messages/update (2) + archiving (3), chat-context/handlers (2), message-search/helpers (1), chats/extras (3) + participants (3), chat-pins (1), chat-search/join (1), chat/service write (1) + read (1) + crud/update (2), chat/moderation (2, owner sentinel preserved).
- **admin.character**: characters card/export/read/remove/update (5), assets/service/read (2).
- **admin.world**: world-lore-entries (1), story-items/handlers (1), story-states/handlers (4), views/worlds (2) + views/search (1).

Frontend UI (`frontend/alpine/mood/loading.ts`) and the middleware solo-admin-equivalence test keep their literal role comparison intentionally.

## Acceptance Criteria

- [x] Implementation complete (44 files, gate 20/22 — only pre-existing lint-ts deno multi-manifest + size-strict story-utils remain)
- [x] Tests passing (test-unit 4573 pass / 0 fail; new matrix tests in actor-auth + characters suites)
- [x] Documentation updated (permissions.ts doc no longer "advisory")

## Residual (documented, out of scope)

- vn-choices.ts + chats/side-channels.ts: strict owner-only (NO admin bypass) — intentionally left as-is (different semantic).
- blog GET endpoints have no ownership/visibility gating (public read) — pre-existing, unchanged.
- Per-resource ownership bypass checks now matrix-driven; future per-role softening = edit DEFAULT_PERMISSIONS.