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

```
Client sends message
  → Server validates (schema, length, role permissions)
  → Server saves to DB (within transaction)
  → Server queues LLM generation (if applicable)
  → Server returns success + message ID to client
  → Client displays confirmed message

If DB write fails:
  → Server returns 500/503
  → Client shows error
  → User can retry (idempotency key prevents duplicate)
```

### Connection Resilience

- Client-side draft persisted in localStorage (web) / temp file (TUI)
- On reconnect: draft restored, user can retry
- Idempotency key prevents duplicate messages on retry

---

## Message Schema

Full table: [`docs/schema.md`](./schema.md#table-messages).

Key columns for this spec:

| Column | Type | Purpose |
| ------ | ---- | ------- |
| `id` | UUID | Primary |
| `chat_id` | UUID FK | Parent chat |
| `actor_id` | UUID FK | Sender |
| `role` | text | 'user', 'assistant', 'character', 'system' |
| `content` | text | Encrypted JSON blob or plaintext |
| `content_format` | text | 'markdown', 'text', 'json', 'html' |
| `content_type` | text | 'text', 'action', 'narration', 'system', 'continuation' |
| `content_encoding` | text | 'identity', 'gzip', 'zstd', 'brotli' |
| `parent_id` | UUID FK | Message tree parent |
| `continuation_index` | int | Set if message is continuation of a partial |
| `status` | text | 'sending', 'confirmed', 'failed', 'partial', 'rejected', 'cancelled' |
| `visibility` | text | 'visible', 'hidden_by_user', 'hidden_by_moderator', 'auto_hidden', 'redacted' |
| `idempotency_key` | text | Retry dedup |
| `created_at` | text | ISO timestamp |
| `edited_at` | text | Nullable |

### Status Scenarios

**Happy path — user message without LLM:**

```
1. Client sends POST /api/messages
2. Server inserts messages row → status="sending"
3. Server confirms write → status="confirmed"
```

**Happy path — user message triggering LLM:**

```
1. Client sends POST /api/messages
2. Server inserts messages row → status="sending"
3. Server calls LLM API, receives full response
4. Server writes response message → status="confirmed"
```

**LLM API error (5xx, timeout, connection failure):**

```
1. Server sends prompt to LLM
2. API returns error (no content received)
3. Server marks generation_attempts.status = "failed"
4. Server marks message.status = "failed"
5. Client shows: "Generation failed. Retry?"
6. User taps Retry (idempotency_key sent)
7. Server checks retry count < MAX_GENERATION_RETRIES (3)
8. New generation_attempt created, API called again
9. On success → message.status = "confirmed"
10. If retries exhausted → "Max retries exceeded" error
```

**Content policy violation (post-generation):**

```
1. LLM returns full response
2. Server policy detector flags content as violating
3. Server marks message.status = "rejected", visibility = "auto_hidden"
4. Server stores policy_analysis in generation_attempts
5. Client shows: "Response filtered by content policy"
6. User edits prompt and resubmits
7. Original rejected message preserved in DB for audit
   (visible to admin via ?showHidden=true)
```

**Timeout mid-stream (partial content):**

```
1. LLM begins streaming tokens
2. Server-side GENERATION_TIMEOUT_MS fires
3. Server captures streamed content as partial_content
4. Server marks attempt.status = "cancelled", message.status = "partial"
5. Client shows partial content with "Continue" button
7. On Continue: POST /api/generation/continue { messageId }
8. Server reads partial_content, builds prefix prompt
9. Server sends to LLM, appends to existing content
10. Continuation stored as new message row:
    continuation_index=2, parent_id=original
11. Client appends continuation to same bubble
12. Multiple continues chain: A(status=partial, idx=0) → A-2(idx=2) → A-3(idx=3)
```

**User cancels mid-generation:**

```
1. LLM is streaming tokens
2. User presses Cancel / Escape
3. Client sends POST /api/generation/cancel { messageId }
4. Server captures whatever has streamed as partial_content
5. Server marks attempt.status = "cancelled" (reason = "user_cancel")
6. Server marks message.status = "cancelled"
7. If content was captured → user can Continue (same as partial flow)
8. If no content yet → no recovery
```

**Network failure (send never reached server):**

```
1. Client sends POST /api/messages
2. Network fails before server receives
3. Client persists draft in localStorage / temp file
4. On reconnect: prompt user to retry
5. Retry sends same idempotency_key
6. Server processes (first write since key unknown)
7. Duplicate key check prevents double writes on re-send
```

**Max retries exhausted:**

```
1. Message is in "failed" state
2. User attempts retry
3. Server checks retry count >= MAX_GENERATION_RETRIES (3)
4. Server returns error: "Max retries exceeded for this message"
5. User must regenerate (new message) instead of retry
```

**Regenerate a confirmed message:**

```
1. User requests regeneration on a confirmed message
2. Server creates new generation_attempt
3. Original message preserved with status="confirmed"
4. New response appended as continuation or replacement
   (configurable: REPLACE_ON_REGENERATE=true|false)
```

---

## Configuration

```env
# Message handling
AUTO_HIDE_INVALID=false           # auto-mark invalid messages as hidden
HIDE_CONFIRMATION=true            # require confirmation before hiding
MAX_MESSAGE_LENGTH=100000         # max content length (plaintext before encrypt)
IDEMPOTENCY_EXPIRY_HOURS=24       # idempotency key TTL
MAX_GENERATION_RETRIES=3          # max auto-retry on LLM failure
GENERATION_TIMEOUT_MS=30000        # LLM response timeout
COMPRESS_THRESHOLD=128             # min bytes before compressing content
```

```json
{
  "messageHandling": {
    "autoHideInvalid": false,
    "hideConfirmation": true,
    "maxLength": 100000,
    "maxGenerationRetries": 3,
    "generationTimeoutMs": 30000,
    "idempotencyExpiryHours": 24,
    "compressThreshold": 128
  }
}
```

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

