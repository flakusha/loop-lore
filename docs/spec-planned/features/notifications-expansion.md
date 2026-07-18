# Notification System Expansion

## Overview

Extended notification system with configurable noise levels and model comparison reactions.

## Notification Events with Noise Levels

| Event               | Noise Level | Default Toast | Description                |
| ------------------- | ----------- | ------------- | -------------------------- |
| generation_finished | high        | on            | LLM generation completed   |
| new_message         | medium      | on            | New message in chat        |
| new_mention         | low         | on            | @mentioned in group chat   |
| new_reaction        | low         | off           | Reaction added to message  |
| system_alert        | critical    | always        | Server maintenance, errors |
| quest_update        | medium      | on            | Quest status changed       |
| gm_action           | medium      | on            | GM world-state change      |
| chat_invite         | low         | on            | Invited to private chat    |

## Noise Filtering Configuration

### Presets

| Preset  | Threshold | Includes                                    |
| ------- | --------- | ------------------------------------------- |
| Quiet   | low       | mentions, quest updates, system alerts only |
| Normal  | medium    | + new messages                              |
| Verbose | high      | + generation finished                       |
| All     | critical  | everything                                  |

### Fine Tuning

Users can override presets per-event in Settings → Notifications:

- Individual toggle for each notification type
- Override applies to toast display only
- System alerts always show regardless of threshold

## Reactions for Model Comparison

Extended reaction system with separate table for model comparison.

### Standard Reactions

- Emoji reactions (👍, ❤️, 😂, etc.)
- Toggle: click to add/remove
- Stored in `message_reactions` table

### Model Comparison Reactions

Table: `model_comparisons`

| Column          | Type | Notes                        |
| --------------- | ---- | ---------------------------- |
| id              | TEXT | PK, UUID                     |
| message_id      | TEXT | FK → messages.id             |
| user_id         | TEXT | FK → users.id                |
| reference_model | TEXT | Model being compared against |
| preference      | TEXT | better/worse/same            |
| confidence      | REAL | User confidence 0-1          |
| created_at      | TEXT | DEFAULT CURRENT_TIMESTAMP    |

### Comparison API Endpoints

```
POST /api/messages/:id/comparisons
Body: { reference_model: "gpt-4", preference: "better", confidence: 0.8 }

GET /api/messages/:id/comparisons
Response: [{ reference_model, preference, count }]

DELETE /api/messages/:id/comparisons/:comparison_id
```

## Notification Storage

Table: `notifications`

| Column      | Type    | Notes                     |
| ----------- | ------- | ------------------------- |
| id          | TEXT    | PK, UUID                  |
| user_id     | TEXT    | FK → users.id             |
| type        | TEXT    | NotificationType enum     |
| title       | TEXT    | Short summary             |
| body        | TEXT    | Optional detail           |
| link        | TEXT    | Deep link path            |
| read        | INTEGER | DEFAULT 0                 |
| noise_level | TEXT    | high/medium/low/critical  |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP |
| data        | TEXT    | JSON payload              |

Index: (user_id, read, created_at)

## Implementation Notes

- Toast container exists in layout.html
- show-toast event dispatched from Alpine modules
- Need notification service for event creation
- Need SSE endpoint for real-time delivery
- Reactions table exists but needs API layer
- Model comparisons table needs creation
