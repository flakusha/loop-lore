# Epic: Time Scale

**Status:** 📝 Draft
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** time, scale, progression, seasons, day-night

## Overview

Time scale system — manage game time progression, day/night cycles, seasons, and time-based events. Covers time flow control, time-gated content, and temporal mechanics. Required upstream for Timeline System epic.

## Core Concepts

### Time Flow

- **Real-time**: 1 game minute = 1 real minute (1:1)
- **Compressed**: Configurable ratio (e.g., 1 game hour = 1 real minute)
- **Paused**: Time does not progress (player-initiated or system-triggered)
- **Manual**: GM advances time explicitly

### Day/Night Cycle

- 24-hour game day divided into periods: dawn, morning, afternoon, evening, night
- Each period affects: lighting, NPC behavior, available activities, event probability
- Configurable day length (default: 24 game hours)

### Seasons & Calendar

- 4 seasons: spring, summer, autumn, winter
- Each season lasts N game days (configurable)
- Seasons affect: weather patterns, available events, NPC schedules, item availability
- Calendar system: game date tracked separately from real date

### Time-Based Events

- **Timed events**: Trigger at specific game times
- **Cooldowns**: Prevent action spamming (real-time or game-time)
- **Schedules**: Recurring events (daily, weekly, seasonal)
- **Time-gated content**: Unlock after N game days or specific dates

## Key Behaviors

- Time progresses at configurable rates (real-time, compressed, paused)
- Day/night cycles affect lighting, NPC behavior, and available activities
- Seasons change weather, events, and available content
- Time-gated content creates anticipation and planning
- Cooldowns prevent action spamming
- Scheduled events create predictable world rhythms

## Acceptance Criteria

- [ ] Time flow control (real-time, compressed, paused, manual)
- [ ] Day/night cycle with configurable periods
- [ ] Season system with configurable duration
- [ ] Time-based event scheduler
- [ ] Cooldown system (real-time and game-time)
- [ ] Time-gated content support
- [ ] GM time advance controls
- [ ] Unit tests for time progression logic

## Dependencies

- None (foundational epic)

## Dependents

- `epic-timeline-system.md` (extends time scale with branching timelines)

## Related Epics

- `epic-weather-environment.md` (seasonal weather)
- `epic-world-locations.md` (location-based time zones)
