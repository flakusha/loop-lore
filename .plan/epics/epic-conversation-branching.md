<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Conversation Branching

**Overview:** (see sections below)


**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, branching, tree-history, alternative-flows

## Overview

Enable draft/alternative flows via tree-structured message history. Allows users to explore different conversation paths and merge branches back to the main thread.

## Reference

- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature           | ID           | Effort | Description                                               |
| ----------------- | ------------ | ------ | --------------------------------------------------------- |
| Branch navigation | FEA-2026-045 | Low    | `parent_id` already in schema; add tree traversal queries |
| Branch UI         | FEA-2026-046 | Med    | Visual branch selector in chat view                       |
| Branch merge      | FEA-2026-047 | Med    | Merge alternative branches back to main thread            |

## Acceptance Criteria

- [ ] Branch navigation queries work on existing `messages.parent_id`
- [ ] Visual branch selector implemented in chat view
- [ ] Branch merge functionality works without data loss

## Dependencies

- Messages schema (existing `parent_id` field)


## Integration Points

### Systems This Epic Depends On

<!-- Systems whose output this epic consumes -->

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Messages Pipeline | `messages.parent_id`, content metadata | Tree traversal queries start from existing schema |
| Lore/Memory Systems | Episodic memory writes | Branch divergence may produce parallel memory tracks |
| Chat Lifecycle | Chat session state, branching context | Branches live inside an existing chat session |

### Systems That Depend On This Epic

<!-- Systems that consume this epic's output -->

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Conversation Branching UI | Branch tree, merge result | Render branch selector + merge controls |
| Context Injection | Active branch path | Context window selection for LLM |
| Search / Retrieval | Branch-scoped message IDs | Filter search results to a chosen branch |

### Shared Data Contracts

<!-- Types, interfaces, or schemas shared between this and other systems -->

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `parent_id` (existing) | Messages | Branch tree key |
| `BranchNode` (new) | UI, Context Injection | Branch representation passed to consumers |

### Cross-System Events

<!-- Events this system emits or subscribes to from other systems -->

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `branch.created` | emits → UI, Memory | New branch diverged |
| `branch.merged` | emits → Context Injection, Search | Branch selected as active |
