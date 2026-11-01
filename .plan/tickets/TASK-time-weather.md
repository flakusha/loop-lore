<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Time/Weather Widget

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Small
**Type:** Feature Task
**Tags:** world, frontend, ui, time, weather
**Epic:** epic-world-management-ui

## Summary

Time and weather display widget, backed by the world conditions engine
(`src/worlds/conditions.ts`, migration 058) via the world conditions SSE
stream (`routes/worlds/world-stream.ts`).

## Core Features

- Current time display (world-clock time-of-day period)
- Weather conditions with icons
- Day/night cycle indicator
- Weather forecast (next 3 world-days, deterministic from the weather seed)

## Acceptance Criteria

- [x] Current time display (game time — engine snapshot time-of-day + world-day counter)
- [x] Weather conditions with icons (weather + season icons, temperature)
- [x] Day/night cycle indicator (derived from the time-of-day period, i18n-labeled)
- [x] Weather forecast (next 3 world-days from the seeded weather function)
- [x] Real-time updates (SSE `conditions` events; re-emission on change)

## Files

- `src/frontend/alpine/time-weather.ts` — widget mixin (reads the SSE snapshot)
- `src/frontend/alpine/weather-icons.ts` — icon tables incl. seasons
- `src/frontend/alpine/world.ts` / `world-types.ts` — SSE wiring + payload schema
- `src/components/world-conditions-panel.html` — rendered on world detail
- `src/routes/worlds/world-stream.ts` — engine-backed snapshot + forecast
