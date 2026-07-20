# Creative Ideas Hub

Research-driven feature proposals for loop-lore, derived from a deep-dive of `docs/`
plus analysis of community projects (SillyTavern, RisuAI, Agnai) and community
feature requests. Each theme is broken into its own document and linked below.

> These are **proposals** — not yet scheduled in `docs/meta/roadmap.md` or
> `.plan/backlog.md`. Approved for drafting 2026-07-18; docs may be reorganized
> later.

## Gap summary

Features popular in competing projects but **absent** from loop-lore docs:

- Emotion portraits (RisuAI killer feature)
- Visual Novel mode (SillyTavern)
- Regex / scripted output transforms (RisuAI most-requested)
- Auto-translation layer (RisuAI)
- TTS / voice narration (SillyTavern narrate-all)
- Adaptive audio / dynamic music
- Memory & relationship visualization
- Cross-device E2E sync
- Conversation analytics
- 3D worlds & navigation

## Themes

| Theme                             | Doc                                                      | Ideas |
| --------------------------------- | -------------------------------------------------------- | ----- |
| Immersion & Presentation          | [immersion-presentation.md](./immersion-presentation.md) | 1–5   |
| Prompt & Output Control           | [prompt-output-control.md](./prompt-output-control.md)   | 6–9   |
| Memory, Continuity & Living World | [memory-continuity.md](./memory-continuity.md)           | 10–14 |
| Authoring & Creation              | [authoring-creation.md](./authoring-creation.md)         | 15–18 |
| Social & Multiplayer              | [social-multiplayer.md](./social-multiplayer.md)         | 19–22 |
| Platform & Reach                  | [platform-reach.md](./platform-reach.md)                 | 23–26 |
| Analytics & Meta                  | [analytics-meta.md](./analytics-meta.md)                 | 27–30 |
| 3D Worlds & Navigation            | [worlds-3d-navigation.md](./worlds-3d-navigation.md)     | 31–34 |

## Top recommendations (high impact, builds on existing specs)

1. **#6 Regex output transforms** — lowest effort, highest power-user delight, pure frontend.
2. **#1 Emotion-reactive portraits** — signature differentiator (RisuAI's killer); reuses `assets` + RPG `status_effects`.
3. **#7 Auto-translation layer** — unlocks non-English markets; builds on `internationalization.md`.
4. **#10 Lore-consistency checker** — unique to a structured RPG engine; uses three-tier memory + artifacts.
5. **#14 World continues without you** — most-requested "alive world" feeling; extends `world_events` + notifications.

## Effort reality

- **Control layer (#6–9)** is cheap and self-contained — best first wave.
- **Presentation (#1–5, #23)** needs TTS/voice + VN rendering, currently absent.
- **Memory/world (#10–14)** needs the unbuilt `memory-system.md` and `rpg-mechanics.md` engines.
- **3D (#31–34)** needs device-tier gating; not for weak devices.

Linked from: [docs/meta/roadmap.md](../meta/roadmap.md)
