<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Social Dynamics

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** NPC-to-NPC information propagation + relationship drift driven by completed encounters (gossip spread, disposition shifts). Research-stage; builds on conversation/decision/memory tickets.

**Context:** No code exists; this is emergent behavior over encounter outcomes, not a service to build first. Explicitly after `TASK-npc-social-conversation`, `-decision`, `-memory`, and the story-auto-drive scheduler. `epic-social-interaction.md` covers the mechanics (reputation/disposition) this loop mutates.

**Acceptance Criteria:**

- [ ] Propagation rule + drift rule specified with worked example in-ticket.
- [ ] Simulator test (in-memory actors, no LLM) shows gossip reaching 2nd hop.
- [ ] `bun run check` green.
