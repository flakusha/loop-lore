<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Generation failure exposure: sanitize raw LLM/error output in chat-visible messages

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

When /create generation fails, chat-visible systemMessages leak backend internals: src/assistant/commands/create.ts:129 echoes up to 500 chars of raw LLM output into the chat on parse failure, and create.ts:189 interpolates provider error text (Entity creation failed: msg). Chat members who could never invoke the Owner-gated command can read these. Reuse the world/location/character review posture (never expose unvalidated content): render a generic failure line to the chat, log the full raw output + error server-side via the structured logger, and add regression tests proving (a) no raw LLM text reaches systemMessage on parse failure, (b) failed runs persist nothing (no partial drafts in any table). Verify the same pattern in workflow entity dispatch (assistant-create backend path). Acceptance: failing generations show only kind + retry hint in chat; full output in server logs; tests green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
