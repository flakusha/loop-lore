<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Emergent Platform Landscape II — AI-Native VN & World-Generation Platforms (2025–2026)

**Created:** 2026-08-31
**Purpose:** Continuation of `emergent-platform-landscape-2026.md` (2026-08-14 sweep). This pass covers the next wave the prior sweep missed: **AI-native visual-novel production platforms** and **agentic world-builder studios** — exemplars **DreamRunner.ai** and **Neta Studio (neta.art)** — plus an adjacent platform sweep of similar 2025–2026 entrants. Same treatment as before: concrete feature extraction, loop-lore gap mapping; inspiration sources, not competitors.

> Sources: official sites/changelogs/blogs (dreamrunner.ai, neta.art), AI Market Watch company profile (Neta), third-party reviews. Verified 2026-08-31. Feature claims below are platform-published; pricing/user counts are point-in-time and recompute before citing.

---

## Bucket D — AI-native visual-novel production ("play it, and it renders")

Platforms that render roleplay as a **full VN production pipeline** (prose + scene art + voice, generated on demand) rather than a chat window. This is loop-lore's own VN-mode territory — highest direct relevance.

### D1. DreamRunner.ai (ForgeDevWorks LLC) — flagship

Browser-based AI visual novel game (desktop + mobile, free plan, monthly ship cadence, Discord-driven roadmap). Positioning line: *"Most AI story tools are a chat window. DreamRunner is a game — a simulated world that keeps its own state, plus the whole production around it."*

Timeline (from blog): Sep 2025 launch + character-consistency image-edit system → Feb 2026 model selection → Apr 2026 free plan + AI-assisted character/location creation + story-memory rework → May 2026 **Depict** → Jun 2026 **Voice** + **character-perspective memories** + **stop-and-respond** + **custom instructions**.

Concretely-named features:

| Feature | Detail | Loop-lore novelty |
| --- | --- | --- |
| **Simulated world with own state** | Not chat history — world keeps state; every action plays out consequences | loop-lore's DB-persisted RPG state is the same philosophy — validates direction |
| **Character-perspective memories** | Each character keeps a bulleted list of what *they* remember/care about, written from their POV; fed back into future summary prompts with description+personality so memories stay in-character ("grumpy mentor vs wide-eyed apprentice remember the same scene differently") | **New.** loop-lore `memory` is global/narrator-level; per-POV memory is a genuine extension → `characters` × `memory` |
| **Bullet summaries, not prose** | Story summaries are concise bullets so fact-retrieval wastes less context | Cheap context-efficiency win for `chat/context window` |
| **Depict — story-aware scene illustration** | One click illustrates the current scene; image prompt composed from *actual story state*: character appearance, outfits, location, POV | **New.** Compiles structured state → image request. loop-lore already holds the state in DB — missing only the compiler (`assets` + VN scene gen + emotion avatars) |
| **Designed voices** | Describe a voice in plain language ("warm, gravelly, late 40s, British accent") → AI generates it; per-character + narrator slots; live volume/pitch sliders with looping preview; optional voicing of Depict frame descriptions | Maps to candidate #2/#12 (TTS) + `TASK-character-voice-profile.md`; voice-design-by-description is a concrete API shape |
| **Stop-and-respond interrupt** | Stop button always visible; story truncates at last line *the user saw*; input frees immediately; queued TTS cancelled cleanly — **never charged for lines not heard** | Cancellation semantics for `turning`/`transport`: truncate-to-observed, side-effect rollback, no-billing-on-cancel |
| **Custom instructions, two layers** | Per-story + account-global, stacking, 5k chars each; applied to impersonations too; travel inside shared/uploaded story exports | Maps to `assistant`/prompt assembly; cheap, well-specified |
| **Regenerate-summary with cost chip** | "Regenerate latest" summary in place, with the credit cost shown up front | Cost-visible regeneration UX (`admin`) |
| **Model picker + auto router** | User-selectable writer model (incl. DeepSeek V4 Pro era); "auto" routes; repeated model failure → explicit "switch models" prompt | `admin/provider health` pattern: fail → offer switch |
| **Character consistency (image-edit based)** | Sep 2025: image-editing model preserves features/expressions across scenes *in any art style* | Same problem as Luma Master Reference (#16/E4); different mechanism — edit-model instead of reference-pack |
| **`.drsf` story export** | Portable file bundling story + custom instructions + designed voices | Export/portability pattern (pairs with Neta WEP, below) |
| **AI-assisted creation** | Create characters/locations by having AI draft them | Standard; `characters` creator assist |

### D2. Adjacent Bucket-D entrants

| Platform | Concretely-named features | Novelty vs DreamRunner |
| --- | --- | --- |
| **Dreammir.ai** | "Be anyone, anywhere, all in a visual novel-like form, with everything generated automatically" (roleplay rendered as VN) | Marketing-level only observed (JS shell); corroborates the VN-render-of-RP trend |
| **miku.gg** | "Generative visual novels" — create + share VNs; iOS app | Share-first generative VN; lower production depth |
| **Story Studio AI** (story-studio.ai) | Four surfaces: Story Chat / Story Creator / **Story Illustrator (PDF/TXT/script → scene-by-scene illustrated VN, style stays consistent, export as readable VN)** / Playground (inpaint, outpaint, frame→video). Image→cinematic clip with optional synced voice narration; "define a character once, recognizable across hundreds of generated images"; unfiltered positioning; pure pay-as-you-go credits (no subscription) | **Text→illustrated-VN importer** is the one novel pull candidate; frame→video motion deferred |
| **Seeles.ai / LlamaGen / sekai.ai** | SEO-oriented "AI visual novel generator" wrappers (branching choices, endings, anime art, custom voices) | Category confirmation; no distinctive extracted feature |

**Trend D:** *state-driven full production* — text, scene art, and per-character voice generated on demand from persistent story/world state. loop-lore owns the hard half (structured state, DB); the production wrappers (Depict-style compiler, voice slots, TTS) are the missing outer layer.

---

## Bucket E — Agentic world-builder studios

### E1. Neta Studio (neta.art) — flagship

Shanghai studio (founded 2022, product Mar 2024; **Pre-A+ $10M+ Mar 2026**, Jiukun Ventures + Baidu Ventures, prior Source Code Capital + MiraclePlus). Positioning: "AI-era Disney/Roblox" — AI eliminates the UGC skill barrier. Scale/metrics (point-in-time, 2026): millions of registered users, millions of user-created characters, hundreds of worlds; very high daily engagement; reported positive unit economics in China before international push. Named competitors they list: Character.AI, NovelAI, ByteDance CatBox, MiniMax Talkie (Talkie already in Bucket A).

**Architecture / protocol features:**

| Feature | Detail | Loop-lore novelty |
| --- | --- | --- |
| **World Expression Protocol (WEP)** | Proprietary layer making user-created assets **persist across model generations** — "assets survive model upgrades"; moat against model obsolescence | **Strongest signal of this sweep.** loop-lore's provider-swappable stack has the substrate but no *world-level asset abstraction* — assets/lore/voices expressed independent of generation model |
| **Neta-Lumina** | Open-source anime T2I model (Apache-2.0, 4th in series; 200+ aesthetics; MoE fine-tune for character consistency; topped HF T2I leaderboard 2025; co-developed on Lumina-Image-2.0 with Shanghai AI Lab / Alpha-VLLM) | Self-hosted style model path for emotion avatars / scene art without provider lock |
| **Atomic creation system** | Worlds built from composable atomic assets (characters, scenes, tools, guides) → "start from one world, create infinite possibilities" | loop-lore entities are already atomic + DB-linked; validates data model |
| **Neta Arena / Neta Bench** | Blind-vote model arena: same prompt + same workflow, only the model changes — side-by-side speedcards and TTS voice-over comparisons | Eval pattern: `admin/provider health` could offer "same turn, other model" A/B |
| **Cohub Apps** | Shareable app pages with live previews; install-as-app support (PWA) | Maps to candidate #7 (PWA) + share surfaces |

**Agent-studio features (from weekly changelogs, Jun–Aug 2026):**

- **Chat agent builds the world**: intent **questionnaire before it starts working**; answers rendered as **structured cards**; **turn-by-turn feedback** accepted; **ping when a turn finishes**; followup messages **queued** with per-generation duration shown; **skill picker**; **@mentions expand into workspace resources as context**; codex-style transcript layout; model name stamped per message.
- **Canvas v2 as board**: multi-select cards, right-click quick actions, copy/paste, **canvas layouts travel with forks and checkpoints**, **import works from other worlds**, off-screen cards skip rendering, **automated narrating camera** plays the story.
- **Forking with lineage**: **fork a chat session at any turn**; **forking a world carries its full track history**.
- **Workspace tabs** (one per canvas work), world switcher in nav rail, share split into public-publish vs private-collaborate with access panel + collab filters, content reporting on public works.
- **Media/narration**: narration text autosaves while typing; **cover art generates while narration streams**; fast scene-image mode; MP4 covers; audio works play in-studio; full-bleed work stage with one-tap downloads; gallery fullscreen v2.
- **Commercialization pass**: per-model **pricing labels in the model picker**, **switch model mid-conversation**, credit packs with tier bonuses + activity history + compare-at prices, checkout recovery, raw discount codes, first-subscription welcome offer, offline-model notices.
- **Platform**: 10-language localization, Google One Tap, CDN-manifest gallery assets, OG/social previews, Explore Atlas gallery that jumps straight into generating from clip/prompt libraries, data-driven tool cards.

**Trend E:** *world-as-project* — an agent operates on versioned, forkable, checkpointed creative workspaces whose assets outlive any model. Directly extends candidate #15 (living-world) with concrete product mechanics (fork-at-turn, track history, cross-world import).

---

## Loop-lore gap synthesis (new, beyond E1–E8 of the first sweep)

| # | Capability | Source | Map to loop-lore | Priority |
| --- | --- | --- | --- | --- |
| E9 | **Character-perspective memory** (per-POV bullet memories feeding future summaries) | DreamRunner | `memory` × `characters` — extends three-tier memory with POV layering | Med |
| E10 | **State→image compiler (Depict pattern)** — current scene illustrated by compiling DB story state (appearance/outfit/location/POV) into one generation request | DreamRunner | `assets` + `rpg`/story state + VN scene gen — **loop-lore's structured backend makes this cheaper here than for chat-window rivals** | Med — good pull candidate |
| E11 | **Interrupt semantics** — stop-and-respond: truncate to last-observed line, cancel queued side-effects (TTS/images), never bill undelivered output | DreamRunner | `turning` + `transport` (SSE/WS) + billing hooks | Low–Med |
| E12 | **Two-layer custom instructions** (per-story + account-global, stacking, exported with the story) | DreamRunner | `assistant` prompt assembly | Low |
| E13 | **Model-agnostic asset persistence** ("World Expression Protocol" pattern) + **portable story bundle export** (`.drsf`: story + instructions + voices) | Neta, DreamRunner | `providers` abstraction + `assets`/`content` export | High (architectural), P6+ — but name the pattern now so assets keep a model-independent representation |
| E14 | **Fork-at-any-turn with carried history** (session fork, world fork keeps full track history) | Neta | `TASK-conversation-branching.md` (Not Started) — concrete acceptance criteria to adopt | Med — feeds existing ticket |
| E15 | **Cost-visible generation** (per-model price labels, mid-session model switch, upfront regen cost chip, credit activity history) | Neta, DreamRunner | `admin` (provider health) + generation UI | Low–Med |
| E16 | **Agent intent-questionnaire preflight** (asks what you want before generating; structured-card answers; queued followups; per-turn feedback) | Neta | `assistant` — cheap, high-UX-value pattern for any generation flow | Low–Med |

Regulatory watch: US state AI-companion legislation is being analyzed as it intersects the game/entertainment space (Harvard JSEL, Aug 2026) — relevant to `age-gate`/`nsfw`/`profanity` epic scope; no feature to extract yet.

---

## Research / References

- DreamRunner.ai: https://dreamrunner.ai/ · /about/ · /blog/ (update log: 2025-09 launch/consistency, 2026-02 models, 2026-04 free+AI-creation, 2026-05 Depict, 2026-06 Voice/POV-memory/stop-and-respond/custom-instructions)
- Neta Studio: https://neta.art/ · changelog https://neta.art/changelogs/ · https://www.ai-market-watch.com/company/neta (funding/metrics profile) · https://marksun.net/blog/nieta-art-raises-over-10m-in-pre-a-funding-to-define-the-infrastructure-for-world-creation (Pre-A+, WEP framing)
- Dreammir.ai: https://dreammir.ai/
- miku.gg: https://miku.gg/
- Story Studio AI: https://story-studio.ai/
- Related planning docs: `.plan/epics/epic-platform-research.md` (candidates table), `.plan/matrix-cross-mechanics.md` (gaps), `emergent-platform-landscape-2026.md` (first sweep, Buckets A/B/C)
