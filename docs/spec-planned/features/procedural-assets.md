# Procedural Asset Pipelines Implementation

## Overview

Extend existing creation pipeline to auto-generate maps, portraits, music, and SFX.

## Implementation

### Extend Pipeline Stages

Current pipeline: Description → Stats → Effects → Image → Placement

Add new stages:
- `audio` - Generate music/SFX
- `map` - Generate location maps
- `portrait` - Generate character portraits

### File: src/story/pipelines/audio.ts

```typescript
export interface AudioPipeline {
  description: string;
  style: string; // ambient, combat, sad, triumphant
  duration: number; // seconds
}

export async function generateAudioAsset(
  input: AudioPipeline
): Promise<{ assetId: string; url: string }> {
  const prompt = `
Generate ${input.style} music for: ${input.description}
Duration: ${input.duration} seconds
Format: ambient loop
`;

  const result = await audioProvider.generate({
    prompt,
    duration: input.duration,
    style: input.style,
  });

  return saveAsset({
    type: "audio",
    url: result.url,
    metadata: { duration: input.duration, style: input.style },
  });
}
```

### File: src/story/pipelines/map.ts

```typescript
export interface MapPipeline {
  locationName: string;
  description: string;
  connections: string[]; // Connected location names
}

export async function generateMapAsset(
  input: MapPipeline
): Promise<{ assetId: string; url: string }> {
  const prompt = `
Dungeon/minimap style map for: ${input.locationName}
Description: ${input.description}
Connected locations: ${input.connections.join(", ")}

Style: top-down, simple lines, labeled rooms
`;

  const result = await imageProvider.generate({
    prompt,
    width: 1024,
    height: 1024,
  });

  return saveAsset({
    type: "image",
    url: result.url,
    metadata: { map_for: input.locationName },
  });
}
```

### Integration with World Rules

```typescript
// src/story/pipelines/registry.ts
export const pipelines = {
  item: [descriptionStage, statsStage, effectsStage, imageStage, placementStage],
  location: [descriptionStage, mapStage, audioStage, placementStage],
  character: [descriptionStage, statsStage, portraitStage],
  npc: [descriptionStage, statsStage, portraitStage, personalityStage],
};

// World config can override pipeline
const worldPipeline = world.rules?.pipelines?.location || pipelines.location;
```

## Edge Cases

- Audio generation fails → fallback to silence
- Map too complex → simplify prompt
- Portrait style mismatch → use world default
- Large batch generation → queue with progress
- Asset storage full → reject with error
- Provider rate limited → retry with backoff

## Configuration

```yaml
procedural_assets:
  enabled: true
  providers:
    image: "sd.cpp"
    audio: "musicgen"
    map: "sd.cpp"
  defaults:
    map_style: "dungeon"
    portrait_style: "portrait"
    audio_style: "ambient"
```