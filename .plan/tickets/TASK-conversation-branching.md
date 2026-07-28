# TASK: Conversation Branching — Tree-Based Chat History

**Status:** ⬜ Not Started
**Priority:** Medium
**Epic:** epic-conversation-branching
**Effort:** Med
**Source:** Roadmap migration, 2026-07-19

## Summary

Enable conversation branching — users can fork from any message point, creating alternative conversation paths. Like git branches for chat.

## Rationale

- Users want to explore "what if" scenarios without losing progress
- RPG players want to try different choices
- Schema already has `parent_id` field on messages

## Design

```
Message Tree:
  A → B → C → D (main branch)
           ↘ E → F (branch from C)
               ↘ G (branch from E)
```

### Data Model

```typescript
interface MessageBranch {
  id: string;
  chatId: string;
  parentMessageId: string; // Branch point
  branchName?: string; // Optional label
  createdBy: string; // User who created branch
  createdAt: Date;
}
```

### UI

- Branch indicator on messages with multiple children
- Branch selector (dropdown or tree view)
- "Create branch" action on any message
- Branch comparison (diff two branches)
- Merge branch (select messages from branch into main)

## Tasks

- [ ] Audit `parent_id` usage in message schema
- [ ] Create `chat_branches` table
- [ ] Add branch CRUD endpoints
- [ ] Add branch indicator to message UI
- [ ] Add branch selector/tree view
- [ ] Add "create branch" action
- [ ] Add branch comparison view
- [ ] Add branch merge (selective message copy)

## Files to Create

- `src/db/schema-branches.ts` — branch tables
- `src/routes/chat-branches.ts` — branch CRUD
- `src/components/branch-indicator.html` — UI component
- `src/components/branch-tree.html` — tree view

## Files to Modify

- `src/db/schema-messages.ts` — parent_id usage
- `src/routes/messages.ts` — branch-aware queries
- `src/views/chat.html` — branch UI integration

## Risk

Med — schema change, UI complexity for tree visualization.
