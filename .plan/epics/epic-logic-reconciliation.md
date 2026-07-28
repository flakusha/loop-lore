# EPIC: Logic Reconciliation (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** High
**Epic ID:** EPIC-2026-36
**Effort:** Continuous
**Issue:** `1e37b11`
**Type:** Ongoing Epic

## Summary

Reconciliation of logic across the codebase — chat logic, group chat logic, permissions, blog creation, automated blog creation, internal message system, encryption, NSFW support, moderation/administration, turn-by-turn chat management, notes system, story-driven targets. Continuously align code with docs, fix inconsistencies, and improve architecture.

## Scope

### Chat Logic

- Single-user chat flow
- Multi-user chat flow
- Chat state management
- Message persistence and retrieval
- Chat archival and restoration

### Group Chat Logic

- Multi-participant conversations
- Turn order and selection
- @mentions and initiative tracking
- Group chat creation and management

### Permissions

- User roles and capabilities
- Permission inheritance
- Role-based access control
- Permission checks across all endpoints

### Blog Creation

- Story publishing workflow
- Public sharing and read-only links
- Story formatting and presentation
- Blog post generation from chats

### Automated Blog Creation

- Auto-generate blog posts from story arcs
- Summary and highlight extraction
- Formatting templates
- Publishing pipeline

### Internal Message System

- User-to-user messaging (similar to e-mail)
- Notification delivery
- Message threading
- E-mail notifications integration

### Encryption

- Symmetric encryption (local/public chats)
- Asymmetric encryption (e2e/private chats)
- Key management and rotation
- Asset encryption

### NSFW Support

- Content filtering and age gates
- NSFW content handling
- Documentation (move docs/.nsfw to epics/tasks)
- Content moderation integration

### Moderation & Administration

- Permission levels and capabilities
- Admin tools and dashboards
- Content moderation workflows
- User management and bans

### Turn-by-Turn Chat Management

- Group chat turn ordering
- User-only mode
- User × LLM mode
- Admin/GM overrides
- Turn scheduling and enforcement

### Notes System

- Story-driven notes
- Target tracking
- Note linking and relationships
- Note search and retrieval

## Linked Tasks

| Task | Title                     | Priority | Status                |
| ---- | ------------------------- | -------- | --------------------- |
| —    | Chat logic audit          | High     | Not Started           |
| —    | Group chat logic review   | High     | Not Started           |
| —    | Permission system audit   | High     | Not Started           |
| —    | Blog creation workflow    | Medium   | Not Started           |
| —    | Automated blog creation   | Medium   | Not Started           |
| —    | Internal message system   | Medium   | Not Started           |
| —    | Encryption reconciliation | High     | In Progress (Epic 17) |
| —    | NSFW support migration    | Medium   | Not Started           |
| —    | Moderation tools          | Medium   | Not Started           |
| —    | Turn-by-turn management   | Medium   | Not Started           |
| —    | Notes system enhancement  | Medium   | Not Started           |

## Files

- `src/routes/chats.ts` — chat logic
- `src/group-chat/` — group chat logic
- `src/middleware/auth.ts` — permissions
- `src/routes/chat-export.ts` — blog/export
- `src/crypto/` — encryption
- `src/age-gate/` — NSFW support
- `src/routes/admin.ts` — moderation
- `src/turning/` — turn management
- `src/routes/notes.ts` — notes system
- `docs/.nsfw/` — NSFW documentation (to be moved)

## Linked Tasks

- TASK-reconciliation-plan.md
- TASK-typescript-mjs-reconciliation.md
