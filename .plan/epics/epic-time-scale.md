# Epic: Time Scale

**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** time, scale, progression, seasons, day-night

## Overview

Time scale system — manage game time progression, day/night cycles, seasons, and time-based events. Covers time flow control, time-gated content, and temporal mechanics.

## Time Systems

### Core Time Model

interface TimeScale {
}
interface GameTime {
}
interface RealTime {
}
interface TimeCompression {
}

### Day/Night Cycle

interface DayNightCycle {
}
interface TimeOfDay {
}
interface LightingState {
}
interface ActivitySchedule {
}

### Seasons & Calendar

interface Season {
}
interface Calendar {
}
interface Holiday {
}
interface SeasonalEvent {
}

### Time-Based Events

interface TimedEvent {
}
interface Cooldown {
}
interface Schedule {
}
interface TimeGate {
}

## Key Behaviors

- Time progresses at configurable rates (real-time, compressed, paused)
- Day/night cycles affect lighting, NPC behavior, and available activities
- Seasons change weather, events, and available content
- Time-gated content creates anticipation and planning
- Cooldowns prevent action spamming
- Scheduled events create predictable world rhythms

## Dependencies

- `epic-world-locations.md` (location time)
- `epic-weather-environment.md` (seasonal weather)
- `specs/time-scale.md` (full design spec)
