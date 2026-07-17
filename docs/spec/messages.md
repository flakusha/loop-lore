# Message System

## Data Integrity & Reliability

Messages are the core data of the application. Unlike SillyTavern, loop-lore
guarantees message persistence.

### Persistence Guarantees

1. **Write-ahead** — Message saved to DB before response returned to client
2. **Transaction-safe** — Message + metadata written in single transaction
3. **Crash recovery** — WAL mode for SQLite; in-flight messages recovered on restart
4. **No silent drops** — If write fails, client receives error (no phantom messages)

### Basic Write Flow

Happy path: client sends → server validates → server saves (transaction) → queues LLM (if applicable) → returns success + ID → client displays.

On failure: server returns 500/503, client shows error, user retries (idempotency key prevents duplicate).

### Connection Resilience

- Client-side draft persisted in localStorage (web) / temp file (TUI)
- On reconnect: draft restored, user can retry
- Idempotency key prevents duplicate messages on retry

---

## Message Schema

Full table definition: `src/db/schema-core.ts` → `Messages` interface.
DDL: `src/db/migrations/001_init.ts` (lines 336-371).

Key design points for the messages table:

- **Unified sender** — `actor_id` FK to `actors` replaces separate `user_id` + `character_id`
- **Tree model** — `parent_id` self-references for replies, swipe variants, continuations
- **Content column** — stores encrypted JSON with key reference (`key_id`)
- **Content encoding** — supports `identity`, `gzip`, `zstd`, `brotli` for large messages
- **Status + visibility** — composite state machine (see Composite State Validation below)
- **Idempotency** — `idempotency_key` for retry deduplication

### Status Scenarios

**Happy path — user message without LLM:**

1. Client sends `POST /api/messages`
2. Server inserts messages row → `status="sending"`
3. Server confirms write → `status="confirmed"`

**Happy path — user message triggering LLM:**

1. Client sends `POST /api/messages`
2. Server inserts messages row → `status="sending"`
3. Server calls LLM API, receives full response
4. Server writes response message → `status="confirmed"`

| Action     | Effect                                                          | Message status                                   |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Continue   | Append to partial — new row with incremented continuation_index | Original stays `partial`                         |
| Regenerate | Full replacement — old message cancelled, new sibling created   | Old → `cancelled`, New → `sending` → `confirmed` |

---

## Configuration

Defined in `src/config/schema.ts` → `MessagesConfig`. Server-side only.

Key env vars:

| Env Var                            | Default  | Notes                                |
| ---------------------------------- | -------- | ------------------------------------ |
| `MESSAGE_AUTO_HIDE_INVALID`        | `false`  | auto-mark invalid messages as hidden |
| `MESSAGE_MAX_LENGTH`               | `100000` | max content length in bytes          |
| `MESSAGE_MAX_GENERATION_RETRIES`   | `3`      | max auto-retry on LLM failure        |
| `MESSAGE_GENERATION_TIMEOUT_MS`    | `30000`  | LLM response timeout in ms           |
| `MESSAGE_IDEMPOTENCY_EXPIRY_HOURS` | `24`     | idempotency key TTL in hours         |

Client-side: `COMPRESS_THRESHOLD` (128 bytes) defined in `src/frontend/browser.ts`.

---

## Message Detail Levels

### Basic View (Default)

```
User: "The knight draws his sword."
Character: *The blade gleams with an eerie blue light.*
```

Shows only: sender, content, relative timestamp (optional).

### Expanded View

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

### Per-Message Toggle

- **Web**: Alpine.js `x-show`, toggle button per message
- **TUI**: Select message + press `d`
- **API**: `?detail=basic|expanded` param, defaults to user preference

### User Preference

Stored in user settings JSON. Fields: `defaultView` (basic|expanded), `showDetailsForRoles`, `alwaysShowStats`.

---

## Canceled Message Display

Messages canceled before any tokens streamed (`status="cancelled"`, empty content):

- **UI display**: Shows "[Cancelled]" placeholder in the chat
- **Swipe counter**: If the canceled message was a swipe variant, its counter disappears. All other swipe counters recalculated on frontend
- **Cleanup**: Periodic DB sweep may delete canceled messages with empty content. User may notice the message suddenly gone from the chat
- **No recovery**: Once deleted, the message is gone — no undo

## Message Tree Traversal

### Data Model

Messages form a tree via `parent_id`. Building the tree:

1. **Root message** — `parent_id IS NULL` (chat's first message)
2. **Replies** — Set `parent_id = parent.id`. Creates a parent-child edge
3. **Continuations** — Partial/cancelled message gets a child with `continuation_index = N+1`. Chains: A(idx=0, partial) → A-2(idx=1) → A-3(idx=2). Not a fork — always appended to parent bubble
4. **Swipe variants** — Siblings sharing the same `parent_id`. User picks one per fork position. The frontend stores the active swipe index

**Example:** Message A is root. B replies to A (parent_id = A.id). B1 continues B (idx=1). B2 continues B1 (idx=2). C is a swipe alternative to B (same parent_id = A.id). D is another reply to A. The active timeline picks one variant per fork.

### Active Timeline (Client-Side Flatten)

1. Start from root message (`parent_id IS NULL` for the chat)
2. Walk children in chronological order (`created_at`)
3. At each fork (siblings with same `parent_id`), pick the **active swipe variant**:
   - The user's last-selected swipe for that position
   - Default to the first sibling (earliest `created_at`)
4. Continuations (`continuation_index > 0`) are always appended to their parent bubble — not a fork
5. **Bottom-to-top fill**: If no messages cached, fetch from latest backwards. If already cached, frontend re-runs the flatten algorithm when switching swipe variants

### Swipe System Overlay

Swipe variants are siblings sharing the same `parent_id`. At each position fork, multiple messages share the same `parent_id` but have different `created_at` timestamps. The user's most recently selected swipe is the active one; the others are swipe alternatives.

- The frontend stores the active swipe index per message position
- Switching swipe re-runs the flatten algorithm
- Continuations inherit their parent's swipe context

### API

- `GET /api/chats/:id/messages?cursor=<created_at>&limit=50&direction=backward` — Returns flattened timeline from cursor, with swipe variants collapsed (only active variant per position)
- `GET /api/messages/:id/variants` — Returns all siblings sharing the same `parent_id` (swipe variants)

## Composite State Validation

`MessageStatus` and `MessageVisibility` form a composite state machine. Not all combinations are valid. The `messageCompositeValidator` in `src/db/enums-core.ts` enforces these pairs:

| Status ↓  | visible | hidden_by_user | hidden_by_moderator | auto_hidden | redacted |
| --------- | ------- | -------------- | ------------------- | ----------- | -------- |
| sending   | ✅      | —              | —                   | —           | —        |
| confirmed | ✅      | ✅             | ✅                  | —           | ✅       |
| failed    | ✅      | ✅             | ✅                  | —           | —        |
| partial   | ✅      | ✅             | ✅                  | —           | —        |
| rejected  | —       | —              | —                   | ✅          | —        |
| cancelled | ✅      | ✅             | ✅                  | —           | —        |

Total: **16 valid pairs** from 6×5=30 possible. See `src/db/enums-core.ts:142-168` for full definitions.

### Invalid combinations will be rejected at the service layer.

---

## Invalid Message Handling

Messages may become invalid due to:

- Failed generation (partial output, timeout) → `partial` or `failed`
- Content policy violation → `rejected`
- Admin review flag → visibility change

### Workflow

1. Message marked status `failed`/`partial`/`rejected` or flagged by system
2. Message still visible to user (not silently deleted)
3. User/admin can hide:
   - Click/tap hide button
   - Config auto-hide `AUTO_HIDE_INVALID=true`
4. Hidden messages set `visibility` to appropriate state (not removed from DB)
5. Admins view hidden via `/api/messages?showHidden=true`
6. Reveal in UI via "Show hidden" toggle
