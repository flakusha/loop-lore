# Notification System

## Overview

Notifications alert users to events that need their attention — mentions in
group chats, quest updates, item offers, GM actions, and world events.
Notifications are per-user, per-device, and configurable.

## Notification Types

| Type               | Trigger                                    | Default |
| ------------------ | ------------------------------------------ | ------- |
| `mention`          | @mentioned in a group chat                 | on      |
| `quest_update`     | Quest status changed by GM                 | on      |
| `item_offer`       | Another player offers an item for trade    | on      |
| `world_event`      | Significant event in a joined world        | off     |
| `chat_invite`      | Invited to a private group chat            | on      |
| `character_update` | A followed character's card was updated    | off     |
| `gm_action`        | GM performed a world-state-changing action | on      |
| `system`           | System alerts (server maintenance, etc.)   | on      |

## Notification Model

Each notification has:

```typescript
interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string; // Short summary: "Alice mentioned you in 'Lost Temple'"
  body?: string; // Optional detail: "@Lyra do you know this spell?"
  link?: string; // Deep link: /chats/chat-uuid?msg=msg-uuid
  read: boolean; // false until user dismisses
  created_at: string;
  data?: Record<string, unknown>; // Type-specific payload
}
```

### Storage (Proposed)

Table: `notifications`

| Column     | Type    | Notes                     |
| ---------- | ------- | ------------------------- |
| id         | TEXT    | PK, UUID                  |
| user_id    | TEXT    | FK → users.id             |
| type       | TEXT    | NotificationType enum     |
| title      | TEXT    | Short summary             |
| body       | TEXT    | Optional detail text      |
| link       | TEXT    | Optional deep link path   |
| read       | INTEGER | DEFAULT 0                 |
| created_at | TEXT    | DEFAULT CURRENT_TIMESTAMP |
| data       | TEXT    | JSON payload (optional)   |

**Index:** `(user_id, read, created_at)` for efficient unread queries.

## Notification Delivery

### In-App (Primary)

Notifications appear in a bell icon in the chat header. Unread count badge
on the bell. Click opens a dropdown list of recent notifications.

- Newest first
- Unread items have a dot indicator
- Click marks as read and navigates to the linked entity
- "Mark all as read" button
- "Clear" swipes to dismiss (does not delete, just hides)

### Email (Future)

For remote multi-user setups, optional email notifications:

- Configurable per notification type
- Sent once (not repeated for same event)
- Includes deep link back to the instance

### Webhook (Future)

For integration with Discord, Slack, etc.:

- GM configures a webhook URL per world
- Selected notification types trigger a POST to the webhook
- Payload includes notification title, body, and link

## Prompt Injection

Relevant notifications are injected into the LLM prompt so characters can
reference recent events:

```
[Recent Events]
- Alice mentioned you in "Lost Temple" chat: "@Lyra do you know this spell?"
- GM moved you to "Dark Cave" location
- Quest "Find the Tome" updated: 3/5 steps complete
```

This keeps the character aware of off-screen events without the user
having to manually relay them.

## User Preferences

Per-user notification settings accessible via Settings → Notifications:

```
Notification Type      | Default | Configurable
-----------------------|---------|-------------
Mention                | on      | on/off
Quest update           | on      | on/off
Item offer             | on      | on/off
World event            | off     | on/off
Chat invite            | on      | on/off
Character update       | off     | on/off
GM action              | on      | on/off
System                 | on      | on/off
```

Also per-world overrides: "Mute this world" silences all notifications
from chats in that world.

## API Endpoints

```
GET /api/notifications?unread=true
Response: 200
[{ ...notification objects... }]

GET /api/notifications/unread-count
Response: 200
{ "count": 5 }

PATCH /api/notifications/:id
Body: { "read": true }
Response: 200

PATCH /api/notifications/read-all
Response: 204

DELETE /api/notifications/:id
Response: 204
```

## Real-Time Delivery (Future)

For live notification delivery without polling:

- **Server-Sent Events (SSE)** — `GET /api/notifications/stream`
- Client opens an SSE connection on login
- Server pushes new notifications as they're created
- Falls back to polling (30s interval) if SSE is unavailable

## Notification Lifecycle

```
1. Event occurs (mention, quest update, etc.)
2. System creates notification record
3. If user is online: push via SSE
4. If user is offline: stored for next login
5. User sees notification in bell dropdown
6. User clicks → marks as read + navigates to link
7. After 30 days, read notifications are auto-purged
```
