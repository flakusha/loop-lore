<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Graph view of plan links to chats, stories, RAG items, assets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-step-planning
**Tags:** assistant, planning, graph

**Summary:** Read-only SVG/DOM graph: nodes = plan items + 1-hop chats/stories/RAG docs/entities/assets via plan_links + asset_links + knowledge-graph relationships; 2-hop on demand; 200-node cap with paging (no O(n2) full render).

**Context:** Interconnections between context RAG items, stories, chats, memories, and assets need visual representation; existing asset_links and knowledge-graph storage (TASK-rag-knowledge-graph, FEAT-memory-visualizer) are reused read-only, no canvas dependency.

**Acceptance Criteria:**

- [ ] 1-hop links render for a plan item to its chats/stories/RAG items/assets.
- [ ] 200-node cap with "show more" paging (test).
- [ ] `bun run check` green.
