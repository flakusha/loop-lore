<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Alternate greeting picker at chat creation

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**
Candidate-for-1.0.0 (feature-research #1, .tmp/intercom/FEATURE-RESEARCH-2026-11-11.md). Surface the imported `alternate_greetings` at chat creation: a picker in the new-chat form plus an optional greeting selection on chat create. Serves the operator-Required character-system leg "greeting message in empty chat".

**Context:**
`actors.alternate_greetings` is fully plumbed but dead at runtime. Import persists it (`src/routes/import/actor.ts:31-35`), export round-trips it in all four formats (`src/characters/exporters/{png,shared,toml,yaml}.ts`), validation enforces max 10 x 5000 chars (`src/characters/validator/constants.ts:25-26`), the column exists since `001_init.ts:944`. SOLE CONSUMER GAP: `seedWelcomeMessages` (`src/routes/chats/create.ts:83-116`) reads ONLY `actors.welcome_message` and inserts one Character message — a card carrying 5 alternate greetings silently degrades to greeting #1. Full grep `alternate_greetings|alternateGreetings` over src/ (35 files) shows no chat-creation, route, or UI consumer. Un-ticketed (giwt "greeting" search: only BUG-greeting-filler-regex).

**Acceptance Criteria:**

- [ ] New-chat form lists the character alternate greetings when one or more exist (default: primary `welcome_message`)
- [ ] Chat create accepts an explicit greeting selection (body field or `greetingIndex`), defaulting to primary when absent
- [ ] `seedWelcomeMessages` inserts the selected greeting instead of unconditionally `welcome_message`
- [ ] Multi-character chats: each character actor seeds its own selected-or-primary greeting
- [ ] No behavior change for characters with no alternate greetings (existing fixtures/tests stay green)
- [ ] Unit tests: selection resolution + fallback; import/export fixtures unchanged

**Caveats:**

- Read-only lane evidence; verify against dev HEAD at implementation time.
- Distinct from card-import parity (theme-2 lane): this only consumes the already-stored column.
