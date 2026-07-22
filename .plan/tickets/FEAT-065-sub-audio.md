# FEAT-065-AUD: Audio/Sound Generation Templates

**Status**: open
**Priority**: low
**Labels**: generation, audio, sound, prompts, templates
**Assignee**:
**Epic**: EPIC-38 (Output Control & Transforms)
**Parent**: FEAT-065 (Prompt Library)
**Related**: FEAT-090 (OpenAI TTS+Whisper), FEAT-089 (ElevenLabs), FEAT-091 (Local TTS/STT)

---

## Description

Design the **audio/sound generation prompt template system** — schema, variables, model families, and prompt formats for TTS, SFX, and music generation. Scaffold the template layer for future `src/generation/audio-gen-route.ts`.

### Current State

❌ **Not implemented**. Audio providers planned (FEAT-089/090/091) but no template layer.

---

## Scope

### Sub-types (proposed)

| Type                   | Model Families                         | Prompt Format               |
| ---------------------- | -------------------------------------- | --------------------------- |
| **TTS** (voice)        | ElevenLabs v3, OpenAI TTS, Piper, Bark | natural + SSML              |
| **SFX** (sound design) | ElevenLabs SFX, Stable Audio           | natural + JSON              |
| **Music**              | MusicGen, Suno-style, Udio             | natural + JSON (genre/mood) |

### Model Families (proposed)

- ElevenLabs v3 (TTS + SFX)
- OpenAI tts-1 / tts-1-hd
- Piper (local TTS)
- Bark (local TTS)
- Stable Audio (SFX)
- MusicGen (music)
- Riffusion (music)

### Prompt Formats (proposed)

1. **natural** — "A warm, friendly female voice reading a bedtime story"
2. **ssml** — `<speak><prosody rate="slow">Hello</prosody></speak>`
3. **json** — `{ genre: "ambient", mood: "calm", instrumentation: ["piano", "strings"] }`

### Variables (proposed)

| Variable              | Source                         | Example                 |
| --------------------- | ------------------------------ | ----------------------- |
| `{{speaker}}`         | actors.display_name / voice_id | "Aria"                  |
| `{{emotion}}`         | request param                  | "excited"               |
| `{{tone}}`            | request param                  | "whisper"               |
| `{{pace}}`            | request param                  | "slow"                  |
| `{{genre}}`           | request param                  | "fantasy orchestral"    |
| `{{mood}}`            | request param                  | "epic battle"           |
| `{{instrumentation}}` | request param                  | "drums, brass"          |
| `{{text}}`            | message content                | "The dragon awakens..." |

### Detail Levels (proposed)

- `instant` — minimal style tags
- `balanced` — one-line style description
- `detailed` — full style + emotion + pacing description

### Gen Modes (proposed)

- `tts` — text → speech
- `sfx` — description → sound effect
- `music` — description → music track
- `voice-clone` — reference audio + text

### API (scaffold)

- [ ] `POST /api/templates/audio` — create
- [ ] `GET /api/templates/audio` — list
- [ ] `GET /api/templates/audio/:id` — retrieve
- [ ] `PATCH /api/templates/audio/:id` — update
- [ ] `DELETE /api/templates/audio/:id` — delete
- [ ] `POST /api/templates/audio/:id/apply` — render

### Files (new, scaffold only)

- `src/db/migrations/0XX_audio_templates.ts`
- `src/db/schema-generation.ts` — `AudioPromptTemplateRow`
- `src/generation/audio-prompt-templates.ts` — mirror `prompt-templates.ts`
- `src/routes/templates.ts` — audio endpoints (return 501 if no provider)

---

## Acceptance Criteria

- [ ] Audio template schema defined (subtype, family, format, mode, detail, variables)
- [ ] `src/generation/audio-prompt-templates.ts` exists with `resolveTemplate()`, `resolveProfile()`, `buildAudioPromptMessages()`
- [ ] CRUD API returns 200 for create/list (501 on apply until provider lands)
- [ ] Unit tests: template resolution, variable substitution
- [ ] Migration adds `audio_prompt_templates` table

---

## Notes

### Why Separate from Image/Video

Audio prompts need **voice/emotion/pace** variables (TTS) or **genre/mood/instrumentation** (music) — entirely different from visual modalities.

### Reference

- `src/generation/prompt-templates.ts` — image template pattern to mirror
- `docs/spec/integrations/llm-serving.md` — provider presets (audio providers future)
- FEAT-089/090/091 — audio provider features
