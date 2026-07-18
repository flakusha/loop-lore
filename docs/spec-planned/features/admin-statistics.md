# Admin Statistics & Moderation

## User Statistics

### Default Metrics (Always Collected)

```sql
-- Table: user_statistics (daily rollups)
CREATE TABLE user_statistics (
  user_id TEXT REFERENCES users(id),
  date DATE,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  violations INTEGER DEFAULT 0, -- profanity, rate limits
  PRIMARY KEY (user_id, date)
);
```

### Violation Tracking

- Profanity filter triggers
- Rate limit exceeded
- Failed login attempts (5+)
- Content flagged by others

### Privacy Controls

```
GET /api/admin/statistics/users
Query: ?period=7d&include_violations=true

Response:
{
  "users": [
    { "id": "u1", "messages": 142, "violations": 3 },
    { "id": "u2", "messages": 89, "violations": 0 }
  ]
}
```

## Stable Diffusion Tuning

### Prompt Injection Templates

```typescript
// src/admin/sd-templates.ts
export const sdTemplates = {
  default: "{prompt}",
  anime: "anime style, cel shading, {prompt}",
  photorealistic: "photorealistic, 8k, professional photography, {prompt}",
  sketch: "pencil sketch, rough lines, {prompt}",
  krita: "digital painting, krita style, {prompt}",
  ideogram: "flat design, ideogram style, {prompt}",
  flux: "flux style, highly detailed, {prompt}",
};

// Admin can customize
// POST /api/admin/sd-templates
// { "template": "custom", "prompt": "my custom prefix, {prompt}" }
```

### Model Selection

- Per-world default model
- Per-chat override
- Per-user preference (if allowed)
- Admin can disable models globally

## Moderation Tools

### Content Review

```
GET /api/admin/moderation/flagged
Query: ?status=pending&type=message|asset|chat

Response:
{
  "items": [
    { "id": "m1", "type": "message", "flagged_by": "u2", "reason": "profanity" }
  ]
}

PATCH /api/admin/moderation/:id/review
Body: { "status": "approved|rejected|escalated" }
```

### Auto-Moderation Rules

```yaml
auto_moderation:
  profanity:
    action: flag
    threshold: 1
  spam:
    action: block
    threshold: 5 messages/minute
  nsfw:
    action: flag_for_review
    confidence: 0.8
```

## Admin Configuration

### Runtime Config Table

```sql
CREATE TABLE admin_config (
  key TEXT PRIMARY KEY,
  value TEXT, -- JSON
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Key examples:
-- "archival_retention_days": 90
-- "notification_retention_days": 30
-- "max_dice_rolls": 100
-- "violation_thresholds": { "profanity": 3, "rate_limit": 10 }
```

### Dangerous Actions

- Disable encryption features
- Clear all notifications
- Force user logout
- Wipe all assets
- Reset world state

All logged with audit trail.
