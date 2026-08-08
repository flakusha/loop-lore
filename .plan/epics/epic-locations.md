# Epic: Locations

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** locations, world, places, travel, geography

## Overview

Locations specification — covers world locations, travel mechanics, place properties, and location-based interactions. Supersedes location sections in `docs/spec/worlds.md`.

## Reference

- Spec: `docs/spec/locations.md`
- Related: `docs/spec/worlds.md`, `docs/spec/npcs.md`

## Location Systems

### Core Location Model

interface Location {
}
interface LocationType {
}
interface TravelRoute {
}
interface LocationState {
}
interface PlaceInteraction {
}

## Acceptance Criteria

- [ ] Location model implemented
- [ ] Travel mechanics functional
- [ ] Place interactions working
- [ ] Location-based events operational

## World & Location Traits

`WorldLocationTraitsService` (src/rpg/world-location-traits/, backed by
`character_world_traits` + `character_location_traits`, migration 010) tracks per-character
world and location traits.

## Wiring & Resolution Plan (2026-08-08 audit)

`WorldLocationTraitsService` is code-complete + tested but has ZERO external importers.
Resolution: mount it under `/api/rpg/world-location-traits` (world + location traits +
aggregate) via the WIRED-7 mount pattern — tracked by `TASK-wire-world-location-traits-routes`.
