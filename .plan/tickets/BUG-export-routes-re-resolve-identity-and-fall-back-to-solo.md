<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Export routes re-resolve identity and fall back to solo

**Status:** Done
**Status Note:** the export routes now prefer the identity the global auth derive already resolved (`ctx.userId`) and only fall back to `resolveUserIdFromRequest` for direct test mounts; the resolver returns null for a presented-but-unresolvable token instead of downgrading to the solo identity.
**Priority:** medium
**Effort:** Medium
**Caveats:** security - the solo fallback in `resolveUserIdFromRequest` is still reachable when no token is presented and the deployment does not enforce auth, so a non-enforcing deployment still resolves the export to the demo user; authorization - the export routes fall back to `resolveUserIdFromRequest` when `ctx.userId` is absent, so a deployment that mounts the routes without the global auth derive re-resolves identity from the cookie; observability - a presented-but-unresolvable token is denied with a 401 and no log line distinguishes it from a request that presented no token at all

**Summary:**

Summary: the export routes re-resolved the acting identity themselves instead of using the identity the global auth derive already resolved, and a presented-but-unresolvable token fell back to the solo (admin-equivalent) identity.

Location: src/routes/export.ts (POST /api/export), src/routes/export-sse/start.ts (POST /api/export-sse/start), src/middleware/auth/token.ts (resolveUserIdFromRequest).

Evidence: both export routes called resolveUserIdFromRequest(ctx.request, database, "solo", authConfig) directly, ignoring the ctx.userId the global auth derive had already populated; the resolver itself returned the solo user whenever a presented token failed to resolve, so an expired or revoked session produced a 200 with a full account export.

Impact: an expired or revoked session could still export the archive under the admin-equivalent solo identity, and the export job was owned by a user id that did not match the identity the status/download ownership guards compare against.

Fix: the export routes now prefer ctx.userId and only fall back to the resolver for direct test mounts, using the configured authConfig.demoUsername instead of the hardcoded "solo"; resolveUserIdFromRequest now returns null for a presented-but-unresolvable token and only falls back to the solo identity when no token was presented and the deployment does not enforce auth.

Fixed by: bugfix-small-batch

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
