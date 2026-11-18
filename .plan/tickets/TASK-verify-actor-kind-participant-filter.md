<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Verify actor-kind participant filter

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Verify and, if absent, implement the participant-picker actor-kind filter named in the multi-assistant/multi-LLM gap ticket.

**Context:** TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows notes the picker filter as an open leg; no dedicated ticket exists for it.

**Acceptance Criteria:**

- [ ] Picker exposes actor-kind filtering for assistant/LLM participants.
- [ ] Test covers filter selection and that rows emit messages through the selected participant.
- [ ] Gap ticket 2f405b6 records the verification result.

**Caveats:** TOCTOU: n/a, UI verification. Security: authorization checks remain server-side. Authorization: participant visibility follows existing chat ownership. Parallelism: isolated UI test. Partial failure: fall back to unfiltered picker. Rollback: revert the filter change. Observability: test report records the path.
