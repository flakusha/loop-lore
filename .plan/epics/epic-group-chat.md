<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Group Chat

**Status:** 🟡 Partial — `src/group-chat` modules exist (mention-parser, turn-selector, index) but the feature was never captured as a first-class epic; linked defects resolved, feature tickets track remaining completion.
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** group-chat, multi-character, mention, turn-orchestration, talkativity

## Overview

Group chat lets multiple characters participate in one conversation. The runtime
pieces (`mention-parser.ts`, `turn-selector.ts`) are implemented but were never
owned by a feature epic — only bug tickets existed. This epic consolidates the
feature surface and closes the open defects.

## Scope

In scope:
- @mention parsing and routing to the correct actor (prefix-collision safe)
- Turn orchestration: talkativity weighting, silence-pass, context-mention boost
- Pause/resume of auto-generation
- Group-chat frontend viewer (mention UI, turn indicators) — tracked under frontend epics

Out of scope:
- World/channel invites (covered by `epic-world-chat-channels-invites`)
- Lifecycle/moderation transitions (covered by `epic-chat-lifecycle-moderation`)

## Task List

| Ticket | Type | Status |
| --- | --- | --- |
| TASK-group-chat-mention-routing | TASK | ⬜ Not Started |
| TASK-group-chat-turn-orchestration | TASK | ⬜ Not Started |
| BUG-group-chat-mention-prefix-collision | BUG | ✅ Resolved — ambiguous prefix returns null, disambiguation prompt |
| BUG-group-chat-talkativity-not-surfaced-in-prompt | BUG | ✅ Resolved — 359a3d3, group-talkativity prompt section |
| BUG-group-chat-silence-pass-not-implemented | BUG | ✅ Resolved — batch-9, pass-filter.ts |
