<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin user DELETE has no self-delete or last-admin guard

**Status:** Not Started
**Priority:** critical
**Effort:** Medium

**Summary:**

The DELETE /api/v1/admin/users/:id handler (src/routes/admin/users.ts:200-210) performs a hard DELETE with only an admin.users permission check. No guard prevents an admin from deleting themselves or the last remaining admin account. Evidence: handler body is just db.deleteFrom('users').where('id', '=', id).execute(). No check against ctx.userId, no count of remaining admins. Impact: An admin can accidentally or maliciously delete their own account or the last admin, locking all users out of admin functions. Fix: Before the delete, reject if id === ctx.userId (self-delete) and reject if the target is an admin and SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ? returns 0 (last admin).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
