# Message System

## Data Integrity & Reliability

Messages are the core data of the application. Unlike SillyTavern, loop-lore guarantees message persistence.

### Persistence Guarantees

1. **Write-ahead** — Message saved to DB before response returned to client
2. **Transaction-safe** — Message + metadata written in single transaction
3. **Crash recovery** — Messages in flight during crash recovered on restart (WAL mode for SQLite)
4. **No silent drops** — If write fails, client receives error (no phantom messages)

### Flow

```
Client sends message
  → Server validates (schema, length, role permissions)
  → Server saves to DB (within transaction)
  → Server queues LLM generation (if applicable)
  → Server returns success + message ID to client
  → Client displays confirmed message

If DB write fails:
  → Server returns 500/503
  → Client shows error, message NOT lost because never confirmed
  → User can retry
```

### Connection Resilience

- Client-side message draft persisted in localStorage (web) or temp file (TUI)
- On reconnect: draft restored, user can retry sending
- Server idempotency key prevents duplicate messages on retry

## Message Schema

Full table definition: [`docs/schema.md`](./schema.md#table-messages).

```
Message {
  id:               UUID (primary)
  chatId:           UUID (foreign key → chats)
  actorId:          UUID (foreign key → actors — unified sender)
  role:             "user" | "assistant" | "system" | "character"
  content:          text
  contentType:      "text" | "action" | "narration" | "system"
  contentEncoding:  "identity" | "gzip" | "zstd" | "brotli"

  -- Message metadata (all nullable, populated when LLM used)
  modelId:          string          -- e.g., "gpt-4", "claude-3-opus"
  provider:         string          -- e.g., "openai", "anthropic", "local"
  tokenCount: {
    prompt:         number
    completion:     number
    total:          number
  }
  tokenCost:        number          -- estimated cost in USD (or provider units)
  generationTimeMs: number          -- time to generate response
  tokensPerSecond:  number          -- generation speed

  -- Status & visibility state machine
  status:           "sending" | "sent" | "confirmed" | "failed"
  visibility:       "visible" | "hidden_by_user" | "hidden_by_moderator"
                    | "auto_hidden" | "redacted"
  hiddenBy:         UUID (FK → actors.id)
  hiddenReason:     string          -- free-text or policy code

  -- Ordering
  createdAt:        timestamp
  editedAt:         timestamp       -- nullable
}
```

### Why `visibility` Instead of a `hidden` Boolean

A boolean `hidden` flag is fragile because it doesn't encode _why_ a message was hidden.
Each hiding reason means different things:

| Visibility State      | Meaning                                | Who can reverse      |
| --------------------- | -------------------------------------- | -------------------- |
| `visible`             | Normal state, message is displayed     | —                    |
| `hidden_by_user`      | User manually hid their own message    | The user             |
| `hidden_by_moderator` | Admin/mod action                       | Admin only           |
| `auto_hidden`         | Content filter or rate-limit triggered | Admin or user appeal |
| `redacted`            | Content was wiped (e.g. PII removed)   | Irreversible         |

A single enum column replaces what would otherwise require 3+ boolean flags (`is_hidden`,
`is_auto_hidden`, `is_redacted`) plus a separate `hidden_reason` string to disambiguate them.
With an enum, the reason IS the state — no columns can contradict each other.

## Message Detail Levels

Messages have two display modes to serve different audiences.

### Basic View (Default — Gameplay/Immersion)

```
User: "The knight draws his sword."
Character: *The blade gleams with an eerie blue light.*
```

Shows only:

- Sender (actor display name)
- Content
- Timestamp (relative, optional)

No metadata visible. Clean, immersive experience.

### Expanded View (Nerd/Admin/Dev)

```
User: "The knight draws his sword."
  ↓ Details
  Role: user | Tokens: 0 (no LLM) | Sent: 2s ago
──────────────────────────────────────────
Character: *The blade gleams with an eerie blue light.*
  ↓ Details
  Role: character | Model: claude-3-opus | Provider: anthropic
  Tokens: 120p + 45c = 165 total | Cost: ~$0.003
  Speed: 22.5 tok/s | Time: 2.0s
  Status: confirmed | ID: msg_abc123
```

Shows all metadata including:

- Token counts (prompt, completion, total)
- Generation cost (estimated)
- Speed (tokens/second)
- Model + provider info
- Message ID
- Status
- Edit history

### Per-Message Detail Toggle

Users toggle between basic/expanded per message:

- **Web**: Alpine.js `x-show` on detail panel, toggle button per message
- **TUI**: Select message + press `d` key to expand/collapse
- **API**: `?detail=basic|expanded` query param, defaults to user preference

### User Preference

```json
{
  "messageDisplay": {
    "defaultView": "basic", // "basic" | "expanded"
    "showDetailsForRoles": [], // empty = default only; e.g. ["system"]
    "alwaysShowStats": false // override: always show token stats
  }
}
```

## Group Chat Considerations

In group chats with multiple characters and human participants:

- Messages from humans (no LLM) omit `modelId`, `provider`, `tokenCost` — these fields are `null`
- Messages from LLM-powered characters include full stats
- System messages (narration, actions) may have partial stats
- Actor table provides unified identity: query `actors.actor_type` to distinguish
  human users from AI characters from system narrators

## Invalid Message Handling

Messages may become invalid due to:

- Failed generation (partial output, timeout)
- Content policy violation detected post-generation
- Admin review flags message

### Workflow

1. Message marked `status: failed` or flagged by system
2. Message still visible to user (not silently deleted)
3. User/admin can hide message via:
   - **Click/tap** hide button
   - **Config auto-hide** `AUTO_HIDE_INVALID=true`
4. Hidden messages set `visibility` to the appropriate state (not removed from DB)
5. Admins can view hidden messages via `/api/messages?showHidden=true`
6. Reveal hidden messages in UI via "Show hidden" toggle

### Configuration

```env
# Message handling
AUTO_HIDE_INVALID=false          # auto-mark invalid messages as hidden
HIDE_CONFIRMATION=true           # require confirmation before hiding
MAX_MESSAGE_LENGTH=100000        # max content length
IDEMPOTENCY_EXPIRY_HOURS=24      # how long idempotency keys are valid
```

```json
// Config option in user settings
{
  "messageHandling": {
    "autoHideInvalid": false,
    "hideConfirmation": true,
    "maxLength": 100000
  }
}
```
