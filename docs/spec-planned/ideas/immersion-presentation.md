# Immersion & Presentation

"Wow"-layer ideas that make chat feel like a living story. Inspiration: SillyTavern
Visual Novel Mode, RisuAI emotion images.

> Prerequisite for most: TTS/voice + VN rendering are currently **absent** (only a
> passing mention in `docs/frontend/chat/multi-llm-story.md`). See effort notes.

## #1 Emotion-reactive portraits

- **Inspiration**: RisuAI emotion images (killer differentiator)
- **What**: Detect emotional state from generated narration → swap character avatar /
  background expression automatically.
- **Fits**: `assets` polymorphic system (already links portraits) + RPG `status_effects`
  (poisoned/blessed/etc. already specced in `docs/spec/rpg-mechanics.md`).
- **Effort**: Med
- **Depends on**: `assets.md`, an emotion classifier (LLM or regex on narration markers)

## #2 Visual Novel Mode

- **Inspiration**: SillyTavern VN (sprites, letterbox, focus, shake)
- **What**: Render chat as a VN scene — character sprites over location backgrounds,
  letterbox bars, focus mode, sprite shake on impact.
- **Fits**: `docs/spec/actors.md` already defines item _sprites_; extend to character
  sprites. Location assets provide backgrounds.
- **Effort**: Med
- **Depends on**: sprite asset pipeline, layout component (`docs/frontend/chat/layout.md`)

## #3 Adaptive soundscape & music

- **Inspiration**: narrative games
- **What**: Background music/sfx that shifts with scene tension (combat → intense,
  calm → soft); per-location ambient loops.
- **Fits**: Location creation pipeline already specces `ambient` audio assets
  (`docs/spec/rpg-mechanics.md`).
- **Effort**: Med
- **Depends on**: audio asset generation, audio player component

## #4 Karaoke TTS

- **Inspiration**: SillyTavern narrate-all
- **What**: Per-character voices with word-by-word highlight synced to streaming tokens.
- **Fits**: `docs/frontend/chat/generation.md` streaming + `multi-llm-story.md` mentions
  TTS as future.
- **Effort**: High
- **Depends on**: TTS provider integration, streaming token events (SSE/WS)

## #5 Director's Mode

- **Inspiration**: blue-sky
- **What**: AI emits camera-angle / scene-cut / music-cue metadata; VN renderer consumes
  it for cinematic playback.
- **Fits**: pairs with #2.
- **Effort**: High
- **Depends on**: #2, structured generation metadata
