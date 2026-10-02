<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness backlog + Jira (frontmatter, enum, provider)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** `tickets/index.json` stays the bookkeeping target; add YAML frontmatter emission, canonical status enum via the giwt.toml alias map, and Jira as a `giwt sync` provider. All sync logic stays in giwt.
**Context:** Lifecycle: author .md → `giwt ticket` (`commands/ticket.ts`: file + `git issue create` + cross-link) → `git issue comment/state` → `bun run plan:sync` → `giwt sync` (headers + issue state → committed `tickets/index.json` ~1.3MB) → tier views via `plan:backlog:sync`. `git issue` FULL, PR→worktree FULL (`prs.ts` via gh), Jira ABSENT. Unbuilt design: `.plan/research-unified-spec-framework.md` (frontmatter + canonical enum + `scripts/spec/`, reuse index.json).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `tickets/index.json` gains `updated/frontmatter/legacy_aliases` keys; backlog gate in `check` enforces them.
- [ ] `ticket.ts` scaffold emits YAML frontmatter; legacy tickets get `_legacy: true`; `giwt plan validate` format gate extended — no new CLI namespace.
- [ ] Canonical status enum enabled through the existing `giwt.toml` alias map + `giwt plan validate --gates status-vocab`; legacy migrated via the designed `scripts/spec/migrate`.
- [ ] Jira as a new `giwt sync` provider (JQL → index.json alongside the git-issue provider); nothing new in loop-lore scripts. Nothing in loop-lore reimplements sync.

## Related Files

- `scripts/worktree/commands/ticket.ts`, `sync.ts` (forwarder), `giwt.toml`, `.plan/research-unified-spec-framework.md`
- `docs/giwt-scripts-map.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
