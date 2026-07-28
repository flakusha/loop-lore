# Epic: Conversation Branching

**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, branching, tree-history, alternative-flows

## Overview

Enable draft/alternative flows via tree-structured message history. Allows users to explore different conversation paths and merge branches back to the main thread.

## Reference

- Future features plan: `docs/meta/future-features-plan.md` (Tier 2)

## Features

| Feature | ID | Effort | Description |
| ------- | -- | ------ | ----------- |
| Branch navigation | FEA-2026-045 | Low | `parent_id` already in schema; add tree traversal queries |
| Branch UI | FEA-2026-046 | Med | Visual branch selector in chat view |
| Branch merge | FEA-2026-047 | Med | Merge alternative branches back to main thread |

## Acceptance Criteria

- [ ] Branch navigation queries work on existing `messages.parent_id`
- [ ] Visual branch selector implemented in chat view
- [ ] Branch merge functionality works without data loss

## Dependencies

- Messages schema (existing `parent_id` field)
