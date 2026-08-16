<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Memory → Character Emotion Integration

**Epic:** `epic-memory-knowledge-systems.md` (FEA-2026-057)
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Integrate memory emotion-impact with character systems: mood, coping, relationships, and prompt assembly.

## Requirements

### Integration Points

| Memory Field                    | Character System    | Integration                                                       |
| ------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `emotion_impact.emotion`        | Mood service        | `momentary` → happiness ±intensity                                |
| `emotion_impact.emotion`        | Coping profile      | `triggers_coping` → activate coping style                         |
| `emotion_impact.target`         | Relationship service| Update relationship strength based on emotion                     |
| `emotion_impact.duration`       | Prompt assembly     | `lasting`/`permanent` → inject into prompt                        |
| `emotion_impact.triggers_coping`| Behavioral dimensions| Activate coping/approach/autonomy                               |

### Prompt Assembly Integration

- `permanent` emotions always emitted in character prompt
- `lasting` emotions emitted when intensity > threshold (e.g., > 30)
- `momentary` emotions only emitted if recent (within last N game-days)

## Tasks

- [ ] Memory → Mood integration: `momentary` emotions affect happiness
- [ ] Memory → Coping integration: `triggers_coping` activates coping profile
- [ ] Memory → Relationship integration: `emotion target` updates relationship strength
- [ ] Prompt assembly: inject `permanent`/`lasting` emotions into character prompt
- [ ] Tests: integration behavior, prompt assembly

## Dependencies

- `TASK-memory-emotion-impact.md` (emotion-impact fields)
- `epic-character-internal-traits.md` (coping profile, mood integration)
- `epic-character-core-system.md` (mood service, relationship service)

## Acceptance Criteria

- [ ] Memory → Mood integration working
- [ ] Memory → Coping integration working
- [ ] Memory → Relationship integration working
- [ ] Prompt assembly includes permanent/lasting emotions
- [ ] Tests pass
