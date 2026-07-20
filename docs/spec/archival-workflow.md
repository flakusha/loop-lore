> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Message Archival Flow

## States

| State    | Description           | Transitions     |
| -------- | --------------------- | --------------- |
| active   | Normal message        | archive, delete |
| archived | Hidden but restorable | restore, purge  |
| purged   | Permanently deleted   | none            |

## Cascade Rules

When archiving a chat:

1. Archive all messages (set `archived_at` timestamp)
2. Link archived assets to archival record
3. Preserve in separate partition/table

When restoring:

1. Restore all messages in chat
2. Restore linked assets
3. Rebuild indexes

When purging:

1. Permanent deletion
2. Cascade delete linked assets
3. Notify participants

## Retention Policy

- Default: 90 days in archived state
- Configurable by admin in system settings
- Purge becomes available after retention period
- GC runs daily to clean expired archives

## UI Flow

### Archive Button

- Appears in chat menu (three dots)
- Confirmation: "Archive this chat? Hidden but restorable for 90 days."
- Triggers soft-delete with `archived_at` timestamp

### Restore Flow

- Archived chats appear in separate view `/views/archived`
- "Restore" button reverses archival
- Available within retention window

### Purge Flow

- Admin-only or user-requested after retention
- Confirmation with "This cannot be undone"
- Permanent deletion with cascade

## API Endpoints

```
POST /api/chats/:id/archive
Response: 200 { archived_at: "2026-07-18T12:00:00Z" }

POST /api/chats/:id/restore
Response: 200

DELETE /api/chats/:id/purge
Response: 204
```
