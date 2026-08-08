# Epic: Replayability

**Status:** 🟢 Code+tests+schema done (migration 035); UNWIRED
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** replayability, branching, new-game-plus, alternate-paths, endings

## Overview

Replayability systems — new game plus, alternate story paths, multiple endings, and content that encourages multiple playthroughs. Covers branching narratives, secret content, and progression persistence.

## Replayability Systems

### New Game Plus

interface NewGamePlus {
}
interface CarryOver {
}
interface PlusDifficulty {
}
interface PlusRewards {
}

### Branching Paths

interface StoryBranch {
}
interface AlternatePath {
}
interface BranchCondition {
}
interface PathConsequence {
}

### Multiple Endings

interface Ending {
}
interface EndingCondition {
}
interface EndingRank {
}
interface EndingReward {
}

### Secret Content

interface SecretUnlock {
}
interface HiddenPath {
}
interface EasterEgg {
}
interface MetaProgression {
}

## Key Behaviors

- New game plus carries over progress, items, or bonuses
- Branching narratives create different story experiences
- Multiple endings reward different playstyles and choices
- Secret content encourages exploration and experimentation
- Meta-progression persists across multiple playthroughs
- Difficulty scaling provides challenge for returning players

## Dependencies

- `epic-emergent-narrative-design.md` (story branching)
- `specs/replayability.md` (full design spec)

## Wiring & Resolution Plan (2026-08-08 audit)

`ReplayabilityService` (src/rpg/replayability/, playthrough + endings + meta + ngp, backed by
`playthroughs` + `meta_progression`, migration 035) is code-complete + tested but has ZERO
external importers — mount it under `/api/rpg/replayability` via `TASK-wire-replayability-routes`
(WIRED-7 mount pattern). Data-model dedup open: `achievements_unlocked` is represented 3 ways
(`player_achievements` rows, `playthroughs` int count, `meta_progression` JSON array) and
`secrets_found` 2 ways; make `player_achievements` the source of truth — tracked by
`TASK-reconcile-achievement-unlock-sources` (runs AFTER the achievements + replayability routes
are wired).
