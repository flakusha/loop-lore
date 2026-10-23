<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend and http-utils type-safety batch

**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

The cat-jam quality pass P2/P3 items that do not fit the route-boundary cast ticket.

- src/frontend/alpine/character-growth-editor.ts:105,131,152,173 — four bare console.error(err) loops with no user-facing message; a failed edit is invisible to the operator.
- src/frontend/alpine/stores/index.ts:61 — console.warn on registration failure, swallowed.
- src/frontend/alpine/admin-audit.ts, admin-chats.ts, admin-users.ts, admin-worlds.ts — every one repeats (this as any).pageSize and (this as any).loadOverview(); declare a typed state interface instead.
- src/routes/http-utils/status.ts:15-16 and errors.ts:151,153 — the same (ctx as any) pattern, duplicated across http-utils. The repo already has a route-ctx-typing skill for this.
- src/assets/serve-raw.ts:83,153 and src/assets/signed-url.ts:49,60,196 — as-unknown byte-array casts around Bun's Uint8Array generics versus Web Crypto BufferSource; unify on the existing toBufferSource helper.
- src/config/load/domain.ts:102,140 and src/config/load/load.ts:46,61,80 — the same as-unknown-as-Record pattern as the domain loaders.

Already filed separately: TASK-frontend-banned-pattern-ownership-comment-claims-eslint-enfo owns eslint.config.mjs:322-327.

Source: .tmp/cat-jam/review-quality.md P2 and P3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
