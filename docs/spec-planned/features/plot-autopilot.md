# Plot Autopilot Implementation

## Overview

AI proposes next plot beats from arc plan. Player picks one to continue story.

## Implementation

### File: src/story/plot-autopilot.ts

```typescript
export interface PlotBeat {
  id: string;
  description: string;
  estimated_turns: number;
  required_assets: string[];
  risk_level: "low" | "medium" | "high";
}

export interface ArcPlan {
  title: string;
  beats: PlotBeat[];
  current_beat_index: number;
  completed: boolean;
}

export async function generateNextBeats(
  worldId: string,
  currentStoryState: string
): Promise<PlotBeat[]> {
  const arcPlan = await getCurrentArcPlan(worldId);

  const prompt = `
You are a story planner. Given the current story state and arc plan, propose 3-5 next plot beats.

ARC PLAN: ${JSON.stringify(arcPlan)}
CURRENT STATE: ${currentStoryState}

Return JSON array of beats:
[
  {"id": "beat-1", "description": "The party discovers the hidden cave entrance", "estimated_turns": 2, "required_assets": [], "risk_level": "low"},
  {"id": "beat-2", "description": "An ambush by goblins in the forest", "estimated_turns": 4, "required_assets": ["goblin_sprite"], "risk_level": "high"}
]
`;

  const response = await llmGenerate({
    messages: [{ role: "user", content: prompt }],
    json: true,
    temperature: 0.7,
  });

  return JSON.parse(response);
}

export async function applyBeat(
  beatId: string,
  chatId: string
): Promise<void> {
  const beat = await db
    .selectFrom("plot_beats")
    .selectAll()
    .where("id", "=", beatId)
    .executeTakeFirst();

  if (!beat) throw new Error("Beat not found");

  // Update story state
  await db
    .updateTable("chats")
    .set({ current_beat: beatId })
    .where("id", "=", chatId)
    .execute();

  // Generate intro message for beat
  const intro = await llmGenerate({
    messages: [{
      role: "user",
      content: `Start the scene: ${beat.description}`,
    }],
  });

  // Send as system message
  await createMessage({
    chat_id: chatId,
    sender_type: "system",
    content: intro,
    metadata: { plot_beat: beatId },
  });
}
```

### UI Integration

```html
<!-- src/views/plot-beats.html -->
<div x-data="plotAutopilot()" class="plot-autopilot">
  <h3>Next Plot Beats</h3>

  <template x-for="beat in beats" :key="beat.id">
    <div class="beat-card" :class="beat.risk_level">
      <p x-text="beat.description"></p>
      <small x-text="`~${beat.estimated_turns} turns`"></small>

      <button @click="selectBeat(beat.id)">Choose This</button>
    </div>
  </template>

  <button @click="refreshBeats">🔄 Generate New Options</button>
</div>
```

### File: src/story/arc-planner.ts

```typescript
export async function createArcPlan(
  worldId: string,
  premise: string
): Promise<ArcPlan> {
  const prompt = `
Create a story arc plan for: ${premise}

Return JSON:
{
  "title": "The Shadow in the Woods",
  "beats": [
    {"id": "b1", "description": "Introduction and hook", "estimated_turns": 3},
    {"id": "b2", "description": "Investigation phase", "estimated_turns": 5}
  ],
  "current_beat_index": 0
}
`;

  const response = await llmGenerate({
    messages: [{ role: "user", content: prompt }],
    json: true,
  });

  const plan = JSON.parse(response);

  await db.insertInto("story_arcs").values({
    id: crypto.randomUUID(),
    world_id: worldId,
    title: plan.title,
    plan_data: JSON.stringify(plan),
    created_at: new Date().toISOString(),
  }).execute();

  return plan;
}
```

## Edge Cases

- LLM returns invalid JSON → retry with lower temp
- Beat conflicts with world state → flag for GM
- Too many beats generated → limit to 5
- Player ignores beats → generate new after 10 turns
- Beat requires missing asset → generate it first
- Arc completed → suggest new arc or end story

## Configuration

```yaml
plot_autopilot:
  enabled: true
  beats_per_turn: 3
  auto_generate: true
  auto_generate_interval: 10 # turns
  max_beat_turns: 10
```