# Creative Ideas Hub

Research-driven feature proposals for loop-lore, derived from a deep-dive of `docs/`
plus analysis of community projects (SillyTavern, RisuAI, Agnai) and community
feature requests. Each theme is broken into its own document and linked below.

> These are **proposals** — not yet scheduled in `.plan/backlog/` or
> `.plan/epics/epic-architecture.md`. Approved for drafting 2026-07-18; docs may be reorganized
> later.

## Gap summary — current 2025-2026 project state

Features popular in competing projects but **absent** from loop-lore. Each notes the
leading implementation + current capability, refreshed 2026-08-12 against SillyTavern,
RisuAI, Agnai, Chub, NovelAI, Open WebUI, KoboldCpp. Bidirectional import/export interop
matrix: `.plan/tickets/TASK-cross-tool-data-portability-review.md`.

- **Emotion portraits** — _RisuAI killer feature._ Per-char `emotionImages[]` +
  `emotionPrompt`; classifier (Ax.Model / MiniLM) emits `<Emotion="...">`; ST Expression
  Images swaps sprites via sentiment classifier (ONNX go-emotions ~28 labels, GIF). →
  loop-lore gap = embedding/LLM classifier + `<Emotion>` parse.
  [RisuAI](https://github.com/kwaroran/RisuAI) ·
  [ST](https://docs.sillytavern.app/extensions/expression-images/)
- **Visual Novel mode** — _SillyTavern_ built-in VN UI + Prome ext; sprites-per-emotion +
  background layering. → loop-lore has VN scenes; adopt layering.
  [ST](https://docs.sillytavern.app/)
- **Regex / scripted output transforms** — _RisuAI most-requested._ RisuAI 4-phase regex
  (`editinput`/`editoutput`/`editprocess`/`editdisplay`) + `@@actions` + CBS; ST STscript
  Turing-complete + Quick Replies + 200+ slash cmds + World-Info Automation IDs. →
  loop-lore seed = regex extraction; prioritize phase split + QR automation.
  [RisuAI](https://deepwiki.com/kwaroran/Risuai/5.2.3-regex-scripts-and-processing) ·
  [ST](https://docs.sillytavern.app/extensions/)
- **Auto-translation layer** — _RisuAI / ST._ RisuAI runtime translate w/ ChatML slots +
  `combineTranslation`; ST (8 providers, auto-mode, caching). → loop-lore lacks.
  [ST](https://docs.sillytavern.app/extensions/translation/)
- **TTS / voice narration** — _SillyTavern narrate-all._ ~15 providers, per-char+persona
  voice map, asterisk-quote filtering; RVC cloning. → loop-lore absent.
  [ST](https://docs.sillytavern.app/extensions/tts/)
- **Adaptive audio / dynamic music** — _SillyTavern Dynamic Audio._ Per-emotion BGM
  (`[emotion]_[n].mp3`), auto switch; Blip animates text. → loop-lore absent; cheap mapping.
  [ST](https://docs.sillytavern.app/extensions/dynamic-audio/)
- **Memory & relationship visualization** — No peer has graph viz (ST = Summarize +
  Vectorization; RisuAI = SuperMemory/HypaMemory). → loop-lore greenfield differentiator.
  [ST](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)
- **Cross-device E2E sync** — Greenfield (ST local-only; RisuRealm cloud not E2E).
  → loop-lore could lead.
- **Conversation analytics** — Greenfield (ST only per-char token stats). → differentiator.
- **3D worlds & navigation** — Adjacent only: ST Live2D/VRM + EmulatorJS; no 3D nav.
  → loop-lore idea unmet by peers.

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

Linked from: [.plan/epics/epic-architecture.md](/plan/epics/epic-architecture.md)
