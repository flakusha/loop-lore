# World Continues Without You Implementation

## Overview

NPCs and world events continue while user is away, delivering via notifications.

## Implementation

### File: src/story/offline-events.ts

```typescript
export interface OfflineEvent {
  id: string;
  world_id: string;
  actor_id: string;
  event_type: "npc_action" | "world_change" | "quest_update" | "mail";
  content: string;
  scheduled_at: string;
  delivered_at: string | null;
}

// Scheduler runs every hour
export async function processOfflineEvents(): Promise<void> {
  const worlds = await db
    .selectFrom("worlds")
    .selectAll()
    .where("offline_events_enabled", "=", true)
    .execute();

  for (const world of worlds) {
    const participants = await db
      .selectFrom("chat_participants")
      .selectAll()
      .where("chat_id", "in", world.chat_ids)
      .execute();

    for (const participant of participants) {
      const lastSeen = await getLastActivity(participant.user_id);
      const hoursAway = (Date.now() - lastSeen) / (1000 * 60 * 60);

      if (hoursAway >= 1) { // Only if away 1+ hour
        const events = await generateOfflineEvents(
          participant.user_id,
          world.id,
          hoursAway
        );

        for (const event of events) {
          await createNotification({
            userId: participant.user_id,
            type: "offline_event",
            title: `${event.actor_name} ${event.event_type}`,
            body: event.content,
            link: `/views/chat/${world.chat_id}`,
            noiseLevel: "medium",
            data: { event_type: event.event_type, actor_id: event.actor_id }
          });
        }
      }
    }
  }
}

async function generateOfflineEvents(
  userId: string,
  worldId: string,
  hoursAway: number
): Promise<OfflineEvent[]> {
  const worldState = await getWorldState(worldId);
  const userActor = await getUserActor(userId, worldId);
  const npcs = await getNPCs(worldId);

  const prompt = `
You are a world simulator. Generate events that occurred while the user was away.

World state: ${JSON.stringify(worldState)}
User character: ${JSON.stringify(userActor)}
NPCs: ${JSON.stringify(npcs)}

Time away: ${hoursAway} hours

Generate 1-3 events. Return JSON:
[
  {"actor_id": "npc-1", "event_type": "npc_action", "content": "Lyra visited the market and bought herbs"},
  {"actor_id": null, "event_type": "world_change", "content": "A storm began approaching the coast"}
]
`;

  const response = await llmGenerate({
    messages: [{ role: "user", content: prompt }],
    json: true,
    temperature: 0.7,
  });

  return JSON.parse(response);
}
```

### Integration with Notifications

```typescript
// Add to NotificationType enum
offline_event: "NPC/world event while you were away"

// Notification display
// src/views/offline-notification.html
<div class="notification-item offline-event">
  <span class="actor-name" x-text="notification.data.actor_name"></span>
  <span x-text="notification.body"></span>
  <button @click="dismiss(notification.id)">✕</button>
</div>
```

### World Clock Integration

```typescript
// src/world/clock.ts
export function getWorldTime(worldId: string): Date {
  const world = await db
    .selectFrom("worlds")
    .select("time_scale")
    .where("id", "=", worldId)
    .executeTakeFirst();

  // time_scale: 1 = real time, 24 = 1 day = 1 hour
  const scale = world?.time_scale ?? 1;
  return new Date(Date.now() * scale);
}
```

## Edge Cases

- User returns while events generating → cancel
- Event generation fails → log error, continue
- Too many events → limit to 5 per offline period
- User has many worlds → parallel with concurrency limit
- NPC doesn't exist anymore → skip event
- World paused → skip event

## Configuration

Per-world:
```json
{
  "offline_events": {
    "enabled": true,
    "min_hours_away": 1,
    "max_events_per_period": 3,
    "event_types": ["npc_action", "world_change", "quest_update", "mail"]
  }
}
```

## Privacy

- Only generate events involving user's characters/NPCs
- Respect private chat boundaries
- Don't reveal other players' actions in private chats