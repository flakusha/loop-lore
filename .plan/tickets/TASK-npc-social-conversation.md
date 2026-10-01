<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Social Conversation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-npcs.md
**Tags:** npc, social
**Summary:** NPC-initiated dialogue generation: proximity/mood/relationship-gated conversation openers flowing through the autonomy scheduler (not the social-skills check path).

**Context:** `TASK-social-interaction.md` owns mechanics (persuasion/intimidation/deception checks, reputation); this ticket owns the agentic trigger — when an NPC decides to start talking. Consumed by the story-auto-drive scheduler once it lands; until then no autonomous caller exists.

**Acceptance Criteria:**

- [ ] Initiation gate (proximity + mood + relationship + chat-buffer cooldown) unit-tested.
- [ ] Initiated conversation flows through the normal turn pipeline (no special-case path).
- [ ] `bun run check` green.
