<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Chat Generation & Streaming Implementation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Related:** docs/frontend/chat/generation.md

## Summary

Implement generation status display, streaming, thinking-process logging, and
3-tier error handling per `docs/frontend/chat/generation.md` — currently an
untracked spec (no `.plan/` ticket or epic references it).

## Context

`docs/frontend/chat/generation.md` defines the UX but has **zero** `.plan/`
linkage (discovered during docs↔planning audit). Spec covers: generation-status
display across Immersion/Basic/Detailed modes, streaming with chat-switch guard,
thinking-process logging, 3-tier error handling, continue-generation (cut-off/
cancelled), idempotent retries, and error-loading-messages handling. This is
high-value: streaming + error handling are core chat UX and currently only
partially wired (see `BUG-chat-*` tickets).

## Acceptance Criteria

- [ ] Generation-status display per mode (Immersion/Basic/Detailed)
- [ ] Streaming + chat-switch guard during generation
- [ ] Thinking-process logging surface during generation
- [ ] 3-tier error handling + continue-generation + idempotent retries
- [ ] Error-loading-messages path handled
- [ ] `bun run check` green; manual UI smoke pass
- [ ] Ticket linked from `docs/frontend/chat/generation.md`
