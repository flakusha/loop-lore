<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: assistant intent regexes hijack normal chat messages

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:** matchWorkflowIntent (src/assistant/workflow-routing.ts:78-94) applies unanchored INTENT_PATTERNS regexes like /make.*character/i, /world.*location/i (src/regex/intent.ts:26-82) to EVERY non-command message via dispatchCommand (src/routes/messages/command.ts:71-77). Ordinary roleplay prose containing make+character or world+location anywhere starts an entity workflow, drops the user message before persistence, and locks chat into step capture. Fix: anchor/gate intent matching (word boundaries + require imperative start or restrict to /create-style prefix), add false-positive tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
