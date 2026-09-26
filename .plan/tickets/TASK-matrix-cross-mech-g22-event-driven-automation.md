<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g22: Event-driven automation (Quick-Replies / auto-execute on triggers)

**Status:** open
**Priority:** low
**Effort:** Small
**Type:** Task
**Summary:** Ship event-triggered slash-command/regex automation — a frontend quick-reply system that fires on startup/user-message/assistant-message and runs a configured chain of commands. Cheap, pure frontend, 0.1.0 quick-win.
**Context:** `matrix-cross-mechanics.md` G22 is 🟢 Low and an explicit 0.1.0 quick-win candidate. Inspiration: SillyTavern Quick Replies, RisuAI dynamic-* events. The matrix notes "all (cross-cutting)" — every system benefits from triggered automation without needing new state.

## Current state

- Slash commands exist but no event bindings.
- Regex automation (`src/middleware/intent/`) hijacks normal messages (see `BUG-assistant-intent-regexes-hijack-normal-chat-messages`).
- No frontend surface for users to configure their own triggers.

**Acceptance Criteria:**

- [ ] New frontend panel "Quick Replies" with `name | trigger_event | trigger_pattern | command_chain | enabled`.
- [ ] Events supported: `startup`, `user_message`, `assistant_message`, `world_tick`, `time_elapsed`.
- [ ] Trigger pattern is a regex (escape-friendly); command chain is an ordered list of slash commands run in sequence with output piped in.
- [ ] Storage: per-user `quick_replies` table; admin route to view/disable.
- [ ] Tests cover each event, the pattern match (positive + negative), and chain execution order.
- [ ] `bun run check` green; no regression in the existing intent-regex path (kept as a separate surface; not folded).

**Tags:** quick-replies, automation, events, frontend, 0.1.0-quick-win, low-severity
**Related:** src/frontend/, src/middleware/intent/, .plan/matrix-cross-mechanics.md (G22 row), BUG-assistant-intent-regexes-hijack-normal-chat-messages

git issue: c4b588c
