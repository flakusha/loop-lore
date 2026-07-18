# Edge Cases Deep Dive

## 12. Dice Engine Edge Cases

### Input Validation

```typescript
// Reject patterns that could DoS
- "1000d10000" → max 100 dice, 1000 sides
- "d0" or "d-5" → sides must be positive
- "0d20" → count can be 0 but return 0 immediately
- "1.5d6" → must be integer
- "d" → missing sides → error
- Empty input → error
```

### Deterministic Mode

- Same seed + same notation = same result (for testing)
- Seed collision probability: ~0.001% for 1M rolls
- Seed 0 or negative → use current time

### Performance

- Pre-compute common rolls (1d20, 2d6) for caching
- Max rolls per minute per user (prevent spam)

## 13. Notification Noise Levels

### Configuration Cascade

```
Global preset (quiet/normal/verbose/all)
  ↓
Per-event override
  ↓
System alerts always show
```

### Race Conditions

- User changes threshold while notification pending → apply new threshold
- Notification created but user deleted → cleanup job
- Multiple tabs open → dedupe via SSE connection ID

### Volume Limits

- Max 50 pending notifications per user
- Older than 30 days auto-prune
- Unread count capped at 99+

## 14. Model Comparison Reactions

### Spam Prevention

- One comparison per message per user per hour
- Daily limit: 100 comparisons
- Rate limit: 10/minute

### Data Quality

- Confidence auto-set to 0.5 for quick reactions
- Confidence 0.0-1.0 validated
- Reference model validated against known models list

### Aggregation

- Daily rollups for model accuracy stats
- Weekly comparison reports
- Auto-flag anomalous comparisons (confidence < 0.1)

## 15. Archival Edge Cases

### Concurrent Operations

```
User A archives chat
User B deletes message
User C sends message

→ Archive wins, deletes after archive completes
→ New message stays unarchived
```

### Partial Failures

- Message archive succeeds, asset fails → retry asset only
- DB connection lost mid-archive → resume from last message
- User loses permission during archive → abort, log

### Restore Conflicts

- Message was purged while archived → restore fails
- Chat was deleted → restore recreates
- Assets missing → restore with placeholder

## 16. Assistant Commands

### Command Parsing

- "/dice 2d6+3" → notation = "2d6+3"
- "/dice 2d6" → trimmed to "2d6"
- "/stats @user" → mention resolved to user_id
- Unknown command → "Unknown command. Try /help"

### Permission Layers

```
World rules (whitelist/blacklist)
  ↓
Chat type (solo/story/group)
  ↓
Participant role (member/gm/observer)
  ↓
User global role (admin/user/viewer)
```

### Response Handling

- LLM timeout → cached response or error
- LLM returns tool call → execute, don't show to user
- Command in wrong context → suggest correction

## 17. Signed URLs

### Security

- Token includes signature of (asset_id, user_id, expires_at)
- Token can be revoked via `asset_tokens.revoked` column
- Rate limit: 100 downloads/hour per user

### Expiration Handling

- Expire + 1 minute grace period
- Expired token → 401 with "Generate new link" hint
- Token reuse → track count, alert on abuse

### Large Files

- Range requests for resume
- 1GB limit per download
- Chunked encoding for streaming

## 18. Filtering Performance

### Index Strategy

```sql
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_assets_type_created ON assets(type, created_at DESC);
CREATE INDEX idx_characters_world_type ON characters(world_id, type);
```

### Query Limits

- Max 1000 results without pagination
- Filter timeout: 5 seconds
- Complex query fallback to full scan with warning

### Cache Strategy

- Popular filter combinations cached 5 minutes
- User-specific filters not cached
- Cache key: hash of filter params + user_id
