<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Personas/impersonation plan + docs bookkeeping sweep

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** low
**Effort:** Medium

## Summary

Reconciliation sweep (docs vs .plan vs src) found stale artifacts, all bookkeeping:

1. `epic-impersonation.md:36-44,58-59` gap list still claims command dispatch unhandled and no name-to-actor resolver — both done (WIRE-impersonate-command-palette-no-actionpayload-dispatch.md resolved in 2ac5cf29; TASK-impersonation-system.md marks them [x]). Update epic gaps/task list.
2. Collapse triple tracking: TASK-impersonation.md duplicates TASK-impersonation-system.md duplicates the epic; mark one superseded.
3. Mark TASK-character-multi-personality-system.md superseded by TASK-character-personality-integrity.md (integrity ticket supersedes only the non-`-system` variant but bans personality switching, contradicting the `-system` design).
4. docs/spec/impersonation.md documents /api/* only; code dual-mounts /api + /api/v1 (register-plugins.ts:198,209; v1/chats-surface.ts:31; v1/content-surface.ts:41) — note the mirror.
5. handlers.ts:199 stale 200-vs-201 docstring (may be folded into BUG-persona-update-on-cross-user-id-returns-200-ok-instead-of-40.md).
6. Path drift inside plan: epic cites src/chat/service.ts vs src/chat/service/participants.ts, and src/frontend/alpine vs src/ — fix refs while touching.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
