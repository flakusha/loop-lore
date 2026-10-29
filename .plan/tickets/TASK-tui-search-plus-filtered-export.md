<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI search plus filtered export

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-import-export-io
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-4 TUI slice (T12): search + filtered (compliance) export.

**Ground state:** Search: `GET /api/v1/messages/search` in `src/routes/message-search/index.ts:48-60` over FTS5 (`messages_fts` + triggers `src/db/migrations/001_init.ts:3661-3684`, standalone index duplicating `content_plaintext`). Export: `GET /api/chats/:id/export` in `src/routes/chat-export/export-route.ts:21-24`, four formats (markdown/json/html/text) via `src/chat/export/formats.ts`, whole-chat only (no query/date filter). TUI: neither (docs rows confirmed, no `search|export` under `src/tui/`).

**Adopt/adapt/defer:** ADOPT Zulip export/search separation (https://zulip.readthedocs.io/en/stable/production/export-and-import.html) — three distinct exports (machine JSON tarball, human HTML archive, **compliance export = exactly messages matching a search query**); plus SQLite FTS5 external-content tables (`content='table'` makes the index a view, no duplicated body; https://sqlite.org/fts5.html#external_content_tables) as the dedup upgrade path for `messages_fts`. Query-builder seed: `src/search/providers/messages.ts:136-153` + `snippet()`/`bm25()`.

**Acceptance criteria:**

- [ ] `/search <query>` renders `GET /api/v1/messages/search` snippets in-transcript with match counts.
- [ ] Export gains optional `query`/`from`/`to` params (compliance-export shape) reused by both web and TUI.
- [ ] TUI `/export [md|json]` writes the file locally and prints the path (no pager).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
