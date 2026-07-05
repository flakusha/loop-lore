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

Happy path:
1. Client sends message
2. Server validates (schema, length, role permissions)
3. Server saves to DB (within transaction)
4. Server queues LLM generation (if applicable)
5. Server returns success + message ID to client
6. Client displays confirmed message

If DB write fails:
1. Server returns 500/503
2. Client shows error
3. User can retry (idempotency key prevents duplicate)

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

**LLM API error (5xx, timeout, connection failure):**

1. Server sends prompt to LLM
2. API returns error (no content received)
3. Server marks `generation_attempts.status = "failed"`
4. Server marks `message.status = "failed"`
5. Client shows: "Generation failed. Retry?"
6. User taps Retry (`idempotency_key` sent)
7. Server checks retry count < `MAX_GENERATION_RETRIES` (3)
8. New `generation_attempt` created, API called again
9. On success → `message.status = "confirmed"`
10. If retries exhausted → "Max retries exceeded" error

**Content policy violation (post-generation):**

1. LLM returns full response
2. Server policy detector flags content as violating
3. Server marks `message.status = "rejected"`, `visibility = "auto_hidden"`
4. Server stores `policy_analysis` in `generation_attempts`
5. Client shows: "Response filtered by content policy"
6. User edits prompt and resubmits
7. Original rejected message preserved in DB for audit (visible to admin via `?showHidden=true`)

**Timeout mid-stream (partial content):**

1. LLM begins streaming tokens
2. Server-side `GENERATION_TIMEOUT_MS` fires
3. Server captures streamed content as `partial_content`
4. Server marks `attempt.status = "cancelled"`, `message.status = "partial"`
5. Client shows partial content with "Continue" button
6. On Continue: `POST /api/generation/continue { messageId }`
7. Server reads `partial_content`, builds prefix prompt
8. Server sends to LLM, appends to existing content
9. Continuation stored as new message row: `continuation_index=1`, `parent_id=original` (original is idx=0)
10. Client appends continuation to same bubble
11. Multiple continues chain: A(idx=0, partial) → A-2(idx=1) → A-3(idx=2)

**User cancels mid-generation:**

1. LLM is streaming tokens
2. User presses Cancel / Escape
3. Client sends `POST /api/generation/cancel { messageId }`
4. Server captures whatever has streamed as `partial_content`
5. Server marks `attempt.status = "cancelled"` (reason = `"user_cancel"`)
6. Server marks `message.status = "cancelled"`
7. If content was captured → user can Continue (same as partial flow)
8. If no content yet → no recovery

**Network failure (send never reached server):**

1. Client sends `POST /api/messages`
2. Network fails before server receives
3. Client persists draft in localStorage / temp file
4. On reconnect: prompt user to retry
5. Retry sends same `idempotency_key`
6. Server processes (first write since key unknown)
7. Duplicate key check prevents double writes on re-send

**Max retries exhausted:**

1. Message is in "failed" state
2. User attempts retry
3. Server checks retry count >= `MAX_GENERATION_RETRIES` (3)
4. Server returns error: "Max retries exceeded for this message"
5. User must regenerate (new message) instead of retry

**Regenerate a confirmed message (full replacement):**

1. User requests regeneration on a confirmed message
2. Server creates new `generation_attempt`
3. Original message status set to `"cancelled"`, visibility set to `"hidden_by_user"`
4. New response written as a new message row with same `parent_id` (swipe replacement)
5. Client swaps the old message for the new one in the active timeline

**Continue vs Regenerate:**

| Action | Effect | Message status |
|--------|--------|---------------|
| Continue | Append to partial — new row with incremented continuation_index | Original stays `partial` |
| Regenerate | Full replacement — old message cancelled, new sibling created | Old → `cancelled`, New → `sending` → `confirmed` |

---

## Configuration

Defined in `src/config/schema.ts` → `MessagesConfig`. Server-side only.

Key env vars:

| Env Var | Default | Notes |
|---------|---------|-------|
| `MESSAGE_AUTO_HIDE_INVALID` | `false` | auto-mark invalid messages as hidden |
| `MESSAGE_MAX_LENGTH` | `100000` | max content length in bytes |
| `MESSAGE_MAX_GENERATION_RETRIES` | `3` | max auto-retry on LLM failure |
| `MESSAGE_GENERATION_TIMEOUT_MS` | `30000` | LLM response timeout in ms |
| `MESSAGE_IDEMPOTENCY_EXPIRY_HOURS` | `24` | idempotency key TTL in hours |

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

```json
{
  "messageDisplay": {
    "defaultView": "basic",
    "showDetailsForRoles": [],
    "alwaysShowStats": false
  }
}
```

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

| Status ↓ | visible | hidden_by_user | hidden_by_moderator | auto_hidden | redacted |
|----------|---------|---------------|--------------------|-------------|----------|
| sending  | ✅      | —            | —                  | —           | —        |
| confirmed| ✅      | ✅           | ✅                 | —           | ✅       |
| failed   | ✅      | ✅           | ✅                 | —           | —        |
| partial  | ✅      | ✅           | ✅                 | —           | —        |
| rejected | —       | —            | —                  | ✅          | —        |
| cancelled| ✅      | ✅           | ✅                 | —           | —        |

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
