# Visual Novel Specification

**Status:** Final
**Authoritative source:** `src/` and `AGENTS.md`

## Overview

Defines the visual novel data model, scene format, branching narrative mechanics, and Q&A system for loop-lore.

## Data Model

### Scene

| Field                 | Type   | Description                                |
| --------------------- | ------ | ------------------------------------------ |
| `id`                  | string | Unique scene identifier                    |
| `background`          | string | Background asset reference                 |
| `character_portraits` | map    | Character → portrait asset reference       |
| `lines`               | array  | Dialogue lines in display order            |
| `choices`             | array  | Player choices leading to next scenes      |
| `next`                | string | Next scene ID (auto-advance if no choices) |

### Branching

| Mechanic             | Description                                  |
| -------------------- | -------------------------------------------- |
| Choice nodes         | Player selects from 2-4 options              |
| Conditional branches | Choices gated by stats, flags, relationships |
| State flags          | Boolean flags set by player decisions        |
| Flag checks          | Branch logic evaluates flag state            |

### Q&A Mechanics

| Element             | Description                   |
| ------------------- | ----------------------------- |
| Question prompts    | NPC asks player questions     |
| Answer options      | 2-4 choices per question      |
| Response generation | NPC responds based on answer  |
| Relationship impact | Answers shift NPC disposition |

## Asset References

- Background images stored in asset system with VN-specific tags
- Character portraits: per-character, per-expression, per-scene
- Scene assets versioned alongside scene data

## Related Epics

- `epic-visual-novel-mode.md`

## Related Tickets

- `TASK-visual-novel-mode.md`
