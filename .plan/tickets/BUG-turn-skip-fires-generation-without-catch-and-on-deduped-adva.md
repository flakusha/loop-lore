<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: turn skip fires generation without catch and on deduped advance

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** src/routes/chats/turn-skip-routes.ts:65-72 fire-and-forgets triggerAutoGeneration with bare void and no .catch, violating the repo convention (src/routes/messages/reply.ts:97-111 attaches .catch with structured logging) — rejection is an unhandled rejection. Also the trigger runs even when result.deduped is true, so a replayed/deduped advance cancel+restarts generation (wasted LLM spend). Fix: attach .catch with log; skip trigger when result.deduped; apply same .catch to the bare void call in src/routes/chats/create.ts:119. Verify: bun test src/routes/ turn-skip tests.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
