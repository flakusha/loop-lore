<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI read-mostly annotations plus auto-translate controls

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-output-control-transforms
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-4 TUI slice (T10): read-mostly annotations + auto-translate controls. Co-bind: epic-gm-shadow-notes (notes half).

**Ground state:** `POST|GET /api/chats/:id/annotations` in `src/routes/chats/annotations.ts:44-113` (shadow kind → `shadow_notes`, note/quest → in-memory store). `PATCH|DELETE /api/chats/:id/auto-translate` in `auto-translate.ts:32-91` (back-compat alias onto `gm_config.contentLanguage`); message translations in `src/chat/message-translations.ts`. TUI: none of these (docs rows confirmed, no `annotation|translat` under `src/tui/`).

**Adopt/adapt/defer:** ADAPT Matrix MSC2675/3381 relation envelope as schema direction only (https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/2675-aggregations-server.md — `m.annotation` → `{key, ts, count}`; migration DEFERRED, out of scope).

**Acceptance criteria:**

- [ ] `/notes` renders `GET …/annotations` in-transcript.
- [ ] `/translate <lang>` / `/translate off` map to existing PATCH/DELETE.
- [ ] Translated bodies render inline below the source line (no separate view).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
