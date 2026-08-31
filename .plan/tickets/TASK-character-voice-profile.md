<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Voice & Speech Profile System

**Epic:** epic-character-internal-traits (D10)
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E5 (Voice calls/live avatars — Kindroid, Nomi, Convai)
**Research Source:** Voice modeling patterns, character voice consistency in LLM roleplay

## Summary

Implement character voice/speech pattern profiles that control how characters express themselves — formality, verbosity, pace, accent, vocabulary, catchphrases, and verbal tics. Voice profiles integrate with mood to modulate expression style.

## Background

Characters in SillyTavern-class platforms need consistent voice beyond personality content. Voice = how they say things (style) vs personality = what they say (content). Research shows that explicit voice profiles with formality, verbosity, pace, and accent fields significantly improve character consistency in LLM roleplay.

Adds D10 to `epic-character-internal-traits.md`.

## Implementation

### VoiceProfile Schema

```typescript
interface VoiceProfile {
  formality: number;           // 0–100 (slang ↔ academic)
  verbosity: number;           // 0–100 (terse ↔ elaborate)
  pace: number;                // 0–100 (slow/deliberate ↔ rapid/frenetic)
  accent: string;              // dialect descriptor (e.g., "Southern drawl", "British RP")
  vocabulary_level: number;    // 0–100 (simple ↔ sophisticated)
  catchphrases: string[];      // recurring expressions
  verbal_tics: string[];       // filler words, habits (e.g., "um", "you know")
  sentence_structure: "simple" | "varied" | "complex" | "fragmented";
  profanity_level: number;     // 0–100 (clean ↔ explicit)
  humor_style?: "dry" | "sarcastic" | "puns" | "observational" | "dark" | "none";
}
```

### Mood Integration

Voice modulates with mood state:
- Low mood → shorter sentences, lower verbosity, slower pace
- High mood → more expressive, higher verbosity, faster pace
- Angry → higher profanity, more fragmented sentences
- Fearful → more verbal tics, shorter sentences

### Anti-Collapse Directive

For non-default voice profiles, include explicit voice instructions in prompt assembly to prevent LLM default helpful voice from overriding character voice.

### Prompt Assembly

```typescript
function buildVoicePrompt(voice: VoiceProfile, mood: MoodState): string {
  const parts: string[] = [];
  parts.push(`Speak in a ${voice.formality > 70 ? "formal" : voice.formality < 30 ? "casual" : "neutral"} tone.`);
  parts.push(`Use ${voice.verbosity > 70 ? "detailed" : voice.verbosity < 30 ? "brief" : "moderate"} sentences.`);
  if (voice.catchphrases.length > 0) {
    parts.push(`Occasionally say "${voice.catchphrases[0]}".`);
  }
  // Mood modulation
  if (mood.happiness < 30) {
    parts.push("Speak more quietly and with shorter sentences than usual.");
  }
  return parts.join(" ");
}
```

## Integration Points

- **epic-character-internal-traits.md** — D10 on CanonicalCharacter
- **TASK-character-mood-happiness.md** — Mood modulates voice parameters
- **epic-character-core-system.md** — Voice persists across character lifecycle
- **TTS integration (future)** — Voice parameters map to TTS settings

## Acceptance Criteria

- [ ] VoiceProfile schema defined with all parameters
- [ ] Voice integrates with CanonicalCharacter model
- [ ] Mood state modulates voice parameters
- [ ] Prompt assembly includes voice instructions
- [ ] Anti-collapse directive prevents LLM default voice override
- [ ] Voice profile persists across sessions
- [ ] Default voice profile for characters without explicit voice
- [ ] Voice parameters influence TTS settings (future)

## Open Questions

1. Should voice profiles be character-specific or shared templates?
2. How should voice interact with group chat (multiple characters speaking)?
3. Should voice evolve over time based on character growth?
4. What's the right granularity for accent descriptors?
5. Should catchphrases be weighted by context?

## Second-Sweep Addendum (2026-08-31 — DreamRunner.ai, candidate #29)

Extend the profile with TTS voice-design bindings (from `docs/ideas/emergent-platform-landscape-2026b.md`):

- [ ] Voice spec expressible as natural-language voice description ("warm, gravelly, late 40s, slight British accent") → provider voice-design API call
- [ ] Per-character + narrator voice slot assignment with preview loop (live volume/pitch sliders)
- [ ] Voice definitions serializable so they travel with story bundle export (TASK-portable-story-bundle-export-import.md)
- [ ] Mood state modulates voice parameters (G34) — keep, feed design params
