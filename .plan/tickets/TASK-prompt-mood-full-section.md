<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-prompt-mood-full-section

**Status**: open
**Priority**: medium
**Labels**: prompt-assembly, character-traits, mood, templates
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `src/db/schema-character.ts` (CharacterMood, MoodEvents), `src/assistant/prompt/sections/emotion-avatar.ts`

## Description

`character_mood` table has `happiness` (0-100), `base_mood`, `current_mood`,
`mood_stability` (0-100) — but only `current_mood` is injected via
`emotionAvatarSection` (and only as a simple string for avatar selection).

The full mood context should be available as a prompt section and template
variables:
- Happiness level with trend (from `mood_events`)
- Mood stability indicator
- Recent mood events (what caused the current mood)

### Acceptance Criteria

- [ ] Extend `emotionAvatarSection` or create new `moodSection` with full mood context
- [ ] Injects: `current_mood`, `happiness`/100, `mood_stability`/100
- [ ] Queries recent `mood_events` (last 5, within 24h) for trend context
- [ ] Format: `Current mood: {current_mood} (happiness: X/100, stability: Y/100)`
- [ ] Recent events shown as: `Mood influenced by: [event_type] +X / [event_type] -Y`
- [ ] Section XML-wrapped: `<character_mood>...</character_mood>`
- [ ] Template variables: `{{character.mood}}`, `{{character.happiness}}`, `{{character.moodStability}}`
- [ ] Does not replace existing emotion avatar injection — complements it
- [ ] Unit test verifying mood data rendering

### Notes

- Mood events have `happiness_delta` and `mood_override` — use both
- Mood stability affects how quickly mood shifts — explain in prompt
- If no mood record exists, section returns empty (no injection)
- Consider: should extreme mood states get stronger prompt emphasis?
