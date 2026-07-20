# TASK: Chat Backgrounds — Static/Dynamic with Location Sync

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Med–High
**Related:** TASK-dynamic-avatars-dota-style, TASK-emotion-intent-detection

## Summary

Immersive chat backgrounds that change based on character location, conversation context, and user action. Static images for performance, dynamic animations for immersion.

## Rationale

- Backgrounds establish setting/mood (forest, castle, spaceship)
- Location-aware backgrounds sync with world/location system
- Dynamic backgrounds react to action (combat → intense, rest → calm)
- Parallax/scroll effects add depth without 3D complexity

## Architecture

### Background Types

| Type | Description | Performance | Use Case |
| ---- | ----------- | ----------- | -------- |
| Static | Single image | Low | Default, low-end devices |
| Parallax | Multi-layer scroll | Med | Depth effect on scroll |
| Animated | CSS/WebGL animation | Med–High | Weather, time-of-day |
| Video | Looping video | High | Cinematic moments |
| Particle | Shader-based | Med | Ambient effects (rain, snow, fire) |

### Location Sync

```
World System:
  world → locations → sub-locations
    ↓
Background Mapping:
  location_id → background_id (static or dynamic)
    ↓
Chat Context:
  current_location → active background
  location_change → background transition
```

### Action Sync

| Action | Background Effect |
| ------ | ----------------- |
| Exploration | Calm, ambient |
| Combat | Intense, red tint, shake |
| Dialogue | Neutral, character-focused |
| Discovery | Flash, particle burst |
| Rest | Dim, warm tones |
| Travel | Parallax scroll, motion blur |

## Background Data Model

```typescript
interface ChatBackground {
  id: string;
  name: string;
  type: 'static' | 'parallax' | 'animated' | 'video' | 'particle';
  locationId?: string;           // Tied to world location
  assetId?: string;              // Static/video asset
  animationConfig?: AnimationConfig;
  particles?: ParticleConfig;
  priority: number;              // Conflict resolution
  conditions?: BackgroundCondition[];
}

interface AnimationConfig {
  type: 'css' | 'webgl';
  keyframes: string;             // CSS animation or shader code
  duration: number;              // ms
  loop: boolean;
}

interface ParticleConfig {
  type: 'rain' | 'snow' | 'fire' | 'dust' | 'magic' | 'custom';
  intensity: number;             // 0-1
  color?: string;
  speed?: number;
}

interface BackgroundCondition {
  type: 'location' | 'action' | 'time' | 'emotion' | 'custom';
  value: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt';
}
```

## Tasks

### Phase 1: Schema & CRUD

- [ ] Create `chat_backgrounds` table (id, name, type, location_id, asset_id, config, priority)
- [ ] Create `chat_background_assignments` table (chat_id, background_id, conditions)
- [ ] Add CRUD endpoints: `GET/POST/PUT/DELETE /api/backgrounds`
- [ ] Add chat assignment: `POST /api/chats/:id/background`
- [ ] Seed default backgrounds (forest, castle, city, space, underwater)

### Phase 2: Static Backgrounds

- [ ] Implement background image serving (optimized, WebP/AVIF)
- [ ] Add background selector in chat settings
- [ ] Add background preview in character editor
- [ ] Implement fallback chain (location → world → default)

### Phase 3: Parallax System

- [ ] Create `src/frontend/background/parallax-renderer.ts`
- [ ] Multi-layer scroll (foreground, midground, background)
- [ ] Mouse/touch parallax effect
- [ ] Scroll-based depth animation
- [ ] Performance: requestAnimationFrame, will-change hints

### Phase 4: Dynamic Backgrounds

- [ ] CSS animation backgrounds (rain, snow, fog)
- [ ] Particle system for ambient effects (reuse from TASK-dynamic-avatars)
- [ ] Time-of-day lighting (morning → noon → evening → night)
- [ ] Weather sync (if world has weather system)

### Phase 5: Location & Action Sync

- [ ] Wire background to chat location state
- [ ] Auto-switch background on location change
- [ ] Smooth transition (crossfade, wipe, fade)
- [ ] Action-based effects (combat shake, discovery flash)
- [ ] Group chat: location-based background for each participant

### Phase 6: Performance & Polish

- [ ] Preload next location background
- [ ] Lazy-load heavy backgrounds (video, WebGL)
- [ ] Low-end fallback (disable particles, parallax)
- [ ] Background cache (IndexedDB for offline)
- [ ] Accessibility: prefers-reduced-motion support

## Files to Create

- `src/db/schema-backgrounds.ts` — background tables
- `src/routes/backgrounds.ts` — CRUD endpoints
- `src/frontend/background/parallax-renderer.ts` — parallax engine
- `src/frontend/background/particle-system.ts` — ambient effects (reuse)
- `src/frontend/background/transition-manager.ts` — crossfade/wipe
- `src/frontend/background/styles.css` — background container

## Files to Modify

- `src/db/schema.ts` — add background tables
- `src/db/migrations/` — migration
- `src/views/chat.html` — background container
- `src/frontend/alpine/chat.ts` — location state binding
- `src/routes/worlds.ts` — location-background linking

## Performance

| Type | Target | Notes |
| ---- | ------ | ----- |
| Static load | < 200ms | WebP/AVIF, lazy |
| Parallax FPS | 30+ | requestAnimationFrame |
| Particle count | < 100 | Ambient only |
| Transition | < 500ms | Crossfade |
| Memory | < 50MB | Cache, dispose |

## Risk

Med–High — multiple rendering modes, performance concerns, location system integration, group chat complexity.

## Inspiration

- Dota 2: hero-specific backgrounds with ambient effects
- Visual novels: location-based scene backgrounds
- Discord: custom chat themes (static only)
- Genshin Impact: dynamic weather/time backgrounds
