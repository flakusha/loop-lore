# Frontend: Admin Panel

**URL**: `/admin`

Administrative interface for managing users, chats, worlds, content
moderation, and system configuration. Only accessible to users with
`admin` role.

---

## Access Control

| Role   | Access admin panel | Actions                                 |
| ------ | ------------------ | --------------------------------------- |
| admin  | Yes                | Full access — all sections, all actions |
| user   | No                 | 403 redirect to `/settings`             |
| viewer | No                 | 403 redirect to `/`                     |
| solo   | No                 | Panel hidden, `/admin` returns 403      |

Admin panel link appears in the hamburger sidebar only for admin users.

---

## Navigation

Left sidebar with section links. Main area shows the selected section.

```
┌──────────────────────────────────────────────────────┐
│ Admin Panel                                    [×]  │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│ 📊 Overview│  [section content]                      │
│ 👥 Users   │                                         │
│ 💬 Chats   │                                         │
│ 🌍 Worlds  │                                         │
│ 📝 Audit   │                                         │
│ 🔍 Review  │                                         │
│ ⚙️ System  │                                         │
│            │                                         │
├────────────┴─────────────────────────────────────────┤
│ Version 0.1.0 · Bun + Kysely · 3 users online       │
└──────────────────────────────────────────────────────┘
```

---

## Overview Dashboard

Summary cards with key metrics:

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 👥 Users │ │ 💬 Chats │ │ 🌍 Worlds│ │ 📦 Assets│
│    12    │ │    47    │ │     5    │ │   234    │
│ +2 today │ │ +8 today │ │ +1 today │ │ +12 today│
└──────────┘ └──────────┘ └──────────┘ └──────────┘

┌──────────────────────────────────────────────────────┐
│ Recent Activity                                      │
│ ──────────────────────────────────────────────────── │
│ 12:34  Alice created world "Darkwood"                │
│ 12:28  Bob sent 5 messages in "Forest Quest"         │
│ 12:15  Charlie registered                            │
│ 12:02  Admin archived chat "Test Chat"               │
│ 11:45  Alice updated location "Cave Entrance"        │
└──────────────────────────────────────────────────────┘
```

- Metrics refresh every 30 seconds (auto-poll)
- Click a metric card to jump to the relevant section
- Recent activity: last 20 actions, filterable by user and type

---

## User Management

**URL**: `/admin/users`

### User List

Table with sortable columns:

| Column    | Sortable | Notes                        |
| --------- | -------- | ---------------------------- |
| Username  | Yes      | Click to view user detail    |
| Display   | Yes      | Display name                 |
| Role      | Yes      | admin / user / viewer / solo |
| Status    | Yes      | active / disabled            |
| Chats     | Yes      | Number of chats owned        |
| Messages  | Yes      | Number of messages sent      |
| Last seen | Yes      | Timestamp of last activity   |
| Created   | Yes      | Registration date            |
| Actions   | No       | Edit / Disable / Delete      |

**Filters:**

- Role dropdown (All / Admin / User / Viewer)
- Status toggle (Active / Disabled / All)
- Search by username or display name
- Date range picker (created between)

**Bulk actions:**

- Select multiple users via checkboxes
- Bulk actions: Change role, Disable, Delete
- Confirmation dialog before bulk destructive actions

### User Detail Panel

Click a username to open a detail panel (slide-in from right):

```
┌─────────────────────────────────────────┐
│ User: alice                        [×]  │
├─────────────────────────────────────────┤
│ Display Name:  Alice                    │
│ Role:          [admin ▼]                │
│ Status:        ● Active                 │
│ Created:       2026-01-15               │
│ Last Seen:     2026-07-15 12:34         │
│                                         │
│ ─── Sessions ────────────────────────── │
│ 1. Chrome · 192.168.1.1 · 2h ago      │
│ 2. Safari · 10.0.0.5 · 1d ago         │
│                          [Revoke All]   │
│                                         │
│ ─── API Keys ───────────────────────── │
│ Key: sk-...abc  Created: 3d ago        │
│                          [Revoke]       │
│ + Add API Key                           │
│                                         │
│ ─── Owned Chats (12) ───────────────── │
│ Forest Quest · Darkwood · 2026-07-15   │
│ Tavern Talk · Darkwood · 2026-07-14   │
│ [View All]                              │
│                                         │
│ ─── Actions ────────────────────────── │
│ [Edit Profile] [Reset Password]        │
│ [Disable Account] [Delete Account]      │
└─────────────────────────────────────────┘
```

**Actions available:**

| Action          | Behavior                                            |
| --------------- | --------------------------------------------------- |
| Change role     | Dropdown: admin/user/viewer. Cannot demote yourself |
| Revoke sessions | Deletes all sessions except current                 |
| Revoke API key  | Deletes specific key, immediate effect              |
| Reset password  | Generates temp password, shows once                 |
| Disable account | Sets status=disabled, all sessions revoked          |
| Delete account  | Cascading delete: chats, messages, assets, sessions |
| Edit profile    | Inline edit: display name, avatar                   |

### Create User

Button in user list header: `+ Add User`

```
┌─────────────────────────────────────────┐
│ Create New User                         │
├─────────────────────────────────────────┤
│ Username:    [____________]             │
│ Display:     [____________]             │
│ Password:    [____________]             │
│ Role:        [user ▼]                   │
│                                         │
│              [Cancel]  [Create User]    │
└─────────────────────────────────────────┘
```

- Username: 3-32 chars, alphanumeric + underscore, unique
- Password: min 8 chars
- On success: user appears in list, toast "User created"
- On error: inline validation messages

---

## Chat Management

**URL**: `/admin/chats`

### Chat List

Table with sortable columns:

| Column       | Sortable | Notes                      |
| ------------ | -------- | -------------------------- |
| Title        | Yes      | Chat title or "Untitled"   |
| Type         | Yes      | direct / group             |
| Owner        | Yes      | Username of creator        |
| World        | Yes      | Linked world name (or "—") |
| Messages     | Yes      | Message count              |
| Participants | Yes      | Number of participants     |
| Created      | Yes      | Timestamp                  |
| Last active  | Yes      | Last message timestamp     |
| Status       | Yes      | active / archived / purged |
| Actions      | No       | View / Archive / Delete    |

**Filters:**

- Type dropdown (All / Direct / Group)
- Status dropdown (All / Active / Archived / Purged)
- Owner dropdown (filter by user)
- World dropdown (filter by world)
- Search by title
- Date range (created or last active)

**Bulk actions:**

- Select multiple chats via checkboxes
- Bulk: Archive, Delete, Change world
- Confirmation dialog before bulk destructive actions

### Chat Detail Panel

Click a chat title to open detail panel:

```
┌─────────────────────────────────────────┐
│ Chat: Forest Quest                 [×]  │
├─────────────────────────────────────────┤
│ Type:       direct                      │
│ Owner:      alice                       │
│ World:      Darkwood                    │
│ Location:   Cave Entrance               │
│ Created:    2026-07-15                  │
│ Messages:   234                         │
│ Participants: alice, character_1        │
│ Status:     ● Active                    │
│                                         │
│ ─── Participants ───────────────────── │
│ alice (owner) · character_1 (NPC)       │
│ + Add participant                       │
│                                         │
│ ─── Recent Messages (10) ───────────── │
│ [message preview list with timestamps]  │
│ [View Full Chat]                        │
│                                         │
│ ─── Actions ────────────────────────── │
│ [Archive Chat] [Delete Chat]            │
│ [Export Chat]   [Change World]          │
│ [View Audit Log]                        │
└─────────────────────────────────────────┘
```

**Actions available:**

| Action              | Behavior                                            |
| ------------------- | --------------------------------------------------- |
| Archive             | Soft-delete, reversible. Messages hidden from users |
| Delete              | Permanent, cascading. Requires confirmation         |
| Export              | Download chat as JSON (messages + metadata)         |
| Change world        | Reassign chat to different world                    |
| View audit log      | Shows all admin actions on this chat                |
| Manage participants | Add/remove participants (group chats)               |

### Chat Moderation

For chats with multiple participants or GM involvement:

- **Freeze chat**: prevent new messages (useful during disputes)
- **Mute user**: prevent specific user from sending in this chat
- **View flagged messages**: messages reported by participants
- **Inject system message**: admin can add narration/guidance

---

## World Management

**URL**: `/admin/worlds`

### World List

| Column     | Sortable | Notes                                 |
| ---------- | -------- | ------------------------------------- |
| Name       | Yes      | World name                            |
| Owner      | Yes      | Username of creator                   |
| Locations  | Yes      | Location count                        |
| Characters | Yes      | Character count                       |
| Chats      | Yes      | Chat count                            |
| Assets     | Yes      | Asset count                           |
| Created    | Yes      | Timestamp                             |
| Status     | Yes      | active / archived / purged            |
| Actions    | No       | Edit / Permissions / Archive / Delete |

**Filters:**

- Owner dropdown
- Status dropdown
- Search by name
- Date range

### World Detail Panel

```
┌─────────────────────────────────────────┐
│ World: Darkwood                   [×]   │
├─────────────────────────────────────────┤
│ Owner:      alice                       │
│ Created:    2026-07-15                  │
│ Locations:  12                          │
│ Characters: 8                           │
│ Chats:      5                           │
│ Assets:     47                          │
│ Status:     ● Active                    │
│                                         │
│ ─── Locations (12) ─────────────────── │
│ Cave Entrance · Forest Path · Tavern    │
│ [View All]                              │
│                                         │
│ ─── Characters (8) ─────────────────── │
│ Merchant · Guard Captain · Sage         │
│ [View All]                              │
│                                         │
│ ─── Permissions ────────────────────── │
│ Owner: alice (full access)             │
│ Editor: bob (edit locations/items)      │
│ Viewer: charlie (read-only)            │
│ + Add user                              │
│                                         │
│ ─── Actions ────────────────────────── │
│ [Edit World] [Archive World]            │
│ [Delete World] [Export World]           │
│ [View Audit Log]                        │
└─────────────────────────────────────────┘
```

### World Permissions

Per-world access control (separate from system roles):

| Permission | What it allows                                 |
| ---------- | ---------------------------------------------- |
| owner      | Full access: edit, delete, manage participants |
| editor     | Edit locations, items, NPCs, notes, assets     |
| viewer     | Read-only: view world, locations, characters   |
| none       | No access (default for all other users)        |

**Permission matrix (system role × world permission):**

| System \ World | owner | editor | viewer | none |
| -------------- | ----- | ------ | ------ | ---- |
| admin          | Full  | Full   | Full   | Full |
| user           | Full  | Editor | Viewer | —    |
| viewer         | —     | —      | Viewer | —    |

Admins override all world permissions. They always have full access.

**Sharing UI:**

```
┌─────────────────────────────────────────┐
│ Share "Darkwood"                        │
├─────────────────────────────────────────┤
│ Current access:                         │
│ alice (owner)                           │
│ bob · [editor ▼]              [Remove]  │
│ charlie · [viewer ▼]          [Remove]  │
│                                         │
│ + Add user: [search users...    ]       │
│              Permission: [editor ▼]     │
│              [Add]                      │
│                                         │
│ Public link: [toggle off]               │
│ (Anyone with link can view)             │
└─────────────────────────────────────────┘
```

### Create World

Button in world list header: `+ Create World`

Opens the world creation wizard (same as user-facing flow, but admin
can pre-configure owners and permissions).

---

## Audit Log

**URL**: `/admin/audit`

Chronological log of all administrative and significant user actions.

### Log Table

| Column    | Sortable | Notes                                 |
| --------- | -------- | ------------------------------------- |
| Timestamp | Yes      | When the action occurred              |
| User      | Yes      | Who performed the action              |
| Action    | Yes      | Action type (see below)               |
| Target    | Yes      | Entity affected (user/chat/world/etc) |
| Details   | No       | Brief description                     |
| IP        | Yes      | Client IP address                     |

**Action types:**

| Category    | Actions                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| Auth        | login, logout, register, session_revoked, password_reset                |
| User        | user_created, user_updated, user_disabled, user_deleted, role_changed   |
| Chat        | chat_created, chat_archived, chat_deleted, message_deleted, chat_frozen |
| World       | world_created, world_updated, world_archived, world_deleted             |
| Permissions | permission_granted, permission_revoked, permission_changed              |
| Assets      | asset_uploaded, asset_deleted, asset_linked, asset_unlinked             |
| System      | config_updated, api_key_created, api_key_revoked                        |
| Moderation  | message_flagged, user_muted, content_reviewed                           |

### Log Filters

- User dropdown (all / specific user)
- Action type dropdown (all / auth / user / chat / world / permissions / assets / system / moderation)
- Target type (all / user / chat / world / asset / system)
- Date range picker
- IP address search
- Free-text search in details field

### Log Detail

Click a log row to expand details:

```
┌──────────────────────────────────────────────────────┐
│ 2026-07-15 12:34  alice  chat_archived              │
│ ──────────────────────────────────────────────────── │
│ Target:  chat "Test Chat" (uuid: abc-123)           │
│ Details: Archived 234 messages, 2 participants       │
│ IP:      192.168.1.1                                 │
│ Session: sess_abc123                                 │
│                                                      │
│ [Restore Chat] [View Chat] [Export Before Archive]   │
└──────────────────────────────────────────────────────┘
```

### Log Retention

- Default: 90 days
- Configurable in system settings
- Older entries archived (compressed JSON) but still searchable
- Log cannot be deleted by non-admins (immutable audit trail)

---

## Content Review

**URL**: `/admin/review`

Moderation queue for flagged content and pending approvals.

### Flagged Content

Messages or assets flagged by users or the auto-moderator.

| Column      | Sortable | Notes                            |
| ----------- | -------- | -------------------------------- |
| Type        | Yes      | message / asset / note           |
| Content     | No       | Preview (truncated to 100 chars) |
| Chat        | Yes      | Chat where content appears       |
| Reported by | Yes      | User who flagged                 |
| Reason      | Yes      | User-provided reason             |
| Status      | Yes      | pending / reviewed / dismissed   |
| Created     | Yes      | When flagged                     |
| Actions     | No       | Review / Dismiss / Delete        |

**Flag button**: available on all messages and assets via the context
menu (desktop: right-click, mobile: long-press). Opens a dialog:

```
┌─────────────────────────────────────────┐
│ Flag Content                            │
├─────────────────────────────────────────┤
│ Reason:                                 │
│ ○ Inappropriate content                 │
│ ○ Spam or advertising                   │
│ ○ Harassment or bullying                │
│ ○ Spoiler (not marked as spoiler)       │
│ ○ Other: [____________]                 │
│                                         │
│         [Cancel]  [Flag]                │
└─────────────────────────────────────────┘
```

### Review Queue

Admin reviews flagged items:

```
┌─────────────────────────────────────────┐
│ Flagged: message by bob in "Forest"  [×]│
├─────────────────────────────────────────┤
│ "The hidden treasure is behind the      │
│  waterfall in the northern cave."       │
│                                         │
│ Flagged by: charlie                     │
│ Reason: Spoiler (not marked as spoiler) │
│                                         │
│ ─── Actions ────────────────────────── │
│ [Keep] [Add spoiler tag] [Delete]       │
│ [Mute user in this chat] [Dismiss flag] │
│                                         │
│ ─── Context ────────────────────────── │
│ Previous message: "Where is the         │
│ treasure hidden?"                       │
│ Next message: (none)                    │
└─────────────────────────────────────────┘
```

**Review actions:**

| Action          | Behavior                                |
| --------------- | --------------------------------------- |
| Keep            | Content stays, flag dismissed           |
| Add spoiler tag | Wraps content in spoiler markup         |
| Delete          | Removes content, notifies reporter      |
| Mute user       | Prevents user from sending in this chat |
| Dismiss flag    | Flag removed, no action on content      |

### Auto-Moderation (configurable)

| Rule             | Default | Behavior                                 |
| ---------------- | ------- | ---------------------------------------- |
| Max flags before | 3       | Auto-hide content after N flags          |
| auto-hide        |         |                                          |
| Profanity filter | off     | Scans for known profanity patterns       |
| Spam detection   | off     | Detects repeated messages (>5 identical) |
| Spoiler auto-tag | off     | Flags untagged spoiler content           |

### Reports

Moderation statistics:

- Flags per day (graph)
- Most flagged users
- Most flagged chats
- Resolution time (average)
- False positive rate

---

## System Configuration

**URL**: `/admin/system`

Server configuration accessible only to admins.

### General

| Setting               | Type   | Default   | Notes                       |
| --------------------- | ------ | --------- | --------------------------- |
| App name              | text   | loop-lore | Displayed in UI header      |
| Registration open     | toggle | true      | Allow new user registration |
| Session timeout (hrs) | number | 24        | Idle session expiry         |
| Max sessions/user     | number | 10        | Concurrent session limit    |
| Max upload size (MB)  | number | 10        | Per-file upload limit       |
| Log retention (days)  | number | 90        | Audit log retention         |

### LLM Configuration

| Setting              | Type   | Default | Notes                       |
| -------------------- | ------ | ------- | --------------------------- |
| Default provider     | select | —       | OpenAI/Anthropic/OpenRouter |
| Default model        | text   | —       | Model for all generations   |
| Max context tokens   | number | 4096    | Global context limit        |
| Temperature          | range  | 1.0     | Default generation temp     |
| Rate limit (req/min) | number | 30      | Per-user LLM request limit  |

### Moderation

| Setting                    | Type   | Default | Notes                    |
| -------------------------- | ------ | ------- | ------------------------ |
| Auto-moderation            | toggle | off     | Enable auto-rules        |
| Profanity filter           | toggle | off     | Scan for profanity       |
| Spam detection             | toggle | off     | Detect repeated messages |
| Max flags before auto-hide | number | 3       | Auto-hide threshold      |

### Danger Zone

- **Purge all audit logs**: permanent, requires "PURGE" confirmation
- **Reset all settings**: restores defaults, requires "RESET" confirmation
- **Factory reset**: full data wipe, requires "DELETE ALL" confirmation
  - Sends to `/admin/factory-reset` with confirmation input

---

## Revision History

**URL**: `/admin/revisions` (global) or inline on any entity detail panel

Tracks all changes to entities (worlds, locations, characters, items,
notes, chat settings).

### Revision Table

| Column    | Sortable | Notes                                 |
| --------- | -------- | ------------------------------------- |
| Timestamp | Yes      | When the change was made              |
| User      | Yes      | Who made the change                   |
| Entity    | Yes      | Type + name (e.g., "World: Darkwood") |
| Field     | Yes      | Which field changed                   |
| Action    | Yes      | created / updated / deleted           |
| Preview   | No       | Before → After (truncated)            |
| Actions   | No       | View diff / Revert                    |

### Diff View

Click "View diff" to see a side-by-side comparison:

```
┌──────────────────────────────────────────────────────┐
│ Revision: 2026-07-15 12:34 by alice                 │
│ Entity:   Location "Cave Entrance"                   │
│ Field:    description                                │
├────────────────────────────┬─────────────────────────┤
│ Before                     │ After                   │
├────────────────────────────┼─────────────────────────┤
│ A dark cave mouth.         │ A dark cave mouth,      │
│                            │ overgrown with moss.    │
│                            │ Faint sounds echo from  │
│                            │ within.                 │
└────────────────────────────┴─────────────────────────┘
```

- Added lines: green highlight
- Removed lines: red highlight
- Changed lines: yellow highlight
- Unified diff view available as toggle

### Revert

Click "Revert" to restore a previous version:

1. Shows confirmation dialog with the diff
2. On confirm: creates a new revision with the old values
3. Entity updated to previous state
4. Logged in audit trail: "Reverted {entity} to revision {N}"

**Revert rules:**

- Cannot revert to a revision older than 30 days (configurable)
- Cannot revert a deletion (entity no longer exists)
- Revert creates a new revision (no data loss)
- Admin can revert any entity; user can revert own entities only

### Revision Retention

- All revisions kept indefinitely by default
- Configurable retention per entity type
- Bulk cleanup available in system settings

---

## Keyboard Shortcuts

| Shortcut     | Context      | Action              |
| ------------ | ------------ | ------------------- |
| `G` then `U` | Admin panel  | Go to Users         |
| `G` then `C` | Admin panel  | Go to Chats         |
| `G` then `W` | Admin panel  | Go to Worlds        |
| `G` then `A` | Admin panel  | Go to Audit Log     |
| `G` then `R` | Admin panel  | Go to Review Queue  |
| `G` then `S` | Admin panel  | Go to System Config |
| `/`          | Any section  | Quick search        |
| `Esc`        | Detail panel | Close panel         |
| `Ctrl+K`     | Global       | Command palette     |
