<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-mood-multi-dimensional: Mood extension — multi-dimensional emotional states (PAD)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Type:** TASK
**Tags:** characters, mood, emotions, pad-model
**Epic:** Character Core System
**Parent:** TASK-character-mood-happiness (umbrella)

## Summary

Extend the single happiness axis to multi-dimensional emotional states (arousal + dominance alongside pleasure), grounded in Plutchik's Wheel, the OCC model, and the PAD model.

## Design

The single happiness axis is a simplification. Real emotional states are
multi-dimensional. Three established models from psychology provide the
foundation:

**Plutchik's Wheel** — 8 primary emotions in opposing pairs:
joy/sadness, trust/disgust, fear/anger, surprise/anticipation.
Emotions combine into dyads (e.g. joy + trust = love).

**OCC Model** (Ortony, Clore, Collins) — 22 emotional states based on
appraisal of events, agents, and objects. Focuses on _why_ an emotion
occurs (approval, reproach, gratitude, pity, etc.).

**PAD Model** (Mehrabein & Russell) — 3 continuous axes:
- **Pleasure** (0–100): displeasure ↔ pleasure (maps to current happiness)
- **Arousal** (0–100): calm ↔ excited (energy level)
- **Dominance** (0–100): submissive ↔ dominant (control feeling)

**Proposed extension:** Add `arousal` and `dominance` axes alongside
existing `happiness` (which maps to Pleasure). This enables emotional
states the single axis cannot express:

| State         | P  | A  | D  | Current label |
| ------------- | -- | -- | -- | ------------- |
| Calm content  | 70 | 20 | 50 | "happy"       |
| Excited joy   | 80 | 90 | 60 | "joyful"      |
| Angry defiance| 20 | 85 | 80 | "angry"       |
| Depressed     | 10 | 15 | 20 | "depressed"   |
| Anxious fear  | 25 | 80 | 15 | "anxious"     |
| Smug superiority | 60 | 30 | 90 | "content"  |

```typescript
interface EmotionalState {
  pleasure: number;   // 0–100 (maps to current happiness)
  arousal: number;    // 0–100 (calm ↔ excited)
  dominance: number;  // 0–100 (submissive ↔ dominant)
}
```

The existing `MoodLabel` enum derives from PAD coordinates via
threshold rules. The `MoodExpressionModifier` extends with arousal and
dominance effects on verbosity, risk-taking, and cooperation.

## Tasks

- [ ] Add `arousal` and `dominance` axes to mood storage alongside `happiness` (maps to Pleasure); migration + schema update.
- [ ] Derive `MoodLabel` from PAD coordinates via threshold rules (keep single-axis labels working as the P-axis projection).
- [ ] Extend `MoodExpressionModifier` with arousal/dominance effects on verbosity, risk-taking, and cooperation.
- [ ] Update prompt injection to surface PAD-derived state where it changes expression.
- [ ] Tests: PAD→label threshold mapping, expression-modifier effects, backwards compatibility of happiness-only data.

## Dependencies

- Parent hub: `TASK-character-mood-happiness.md`
- **Depends on:** TASK-mood-core (extends its `MoodState` / `MoodExpressionModifier`).
- Sibling: TASK-mood-contagion uses the Dominance axis for contagion weighting — coordinate ordering.
