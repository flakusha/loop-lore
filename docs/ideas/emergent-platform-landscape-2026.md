# Emergent Platform Landscape — RPG / Agentic / Creative AI (2026)

**Created:** 2026-08-14
**Purpose:** Research the **emergent (commercial, ad-visible, 2025–2026) platforms** beyond the already-reviewed open-source set (SillyTavern, RisuAI, Agnai, Chub, NovelAI, Open WebUI, KoboldCpp) and the media-covered legacy (Character.AI, Replika). Extracts concrete feature lists and maps them to loop-lore gaps. Complements `epic-platform-research.md` (12 candidates) and the `docs/ideas/` hub (34 ideas).

> **Continuation of prior analysis (per plan):** this is the `rpg/agentic/creative` sweep the user requested — the already-reviewed corpus is NOT re-researched. New here: **agentic NPC/autonomy engines, commercial companion apps, living-world/narrative sims, and creative/multimodal pipelines** — the categories now dominating ad spends.

---

## Bucket A — Consumer companion AI platforms (inspiration)

Widely-advertised consumer companion apps. Their repeated feature set is a strong demand
signal for what users value.

| Platform | Concretely-named features | Loop-lore-relevant novelty | Diff |
| --- | --- | --- | --- |
| **Kindroid** | **Five-tier cascaded memory** (patented): (1) stored diary, (2) user-pinned key memories, (3) auto conversation summaries, (4) emotional pattern tracking, (5) cascaded combined layer; **47 per-companion settings**; multi-character group chat where characters talk to each other; voice/video calls; selfie generation with identity preservation; journal; **Away Proactive** (text+selfie, context-aware, anti-spam brake, Ultra plan $24.99/mo); 1.2M downloads, 4.8★ App Store | Cross-conversation persistent memories + **multi-character inter-character dialogue** (direct input for NPC/agent group scenes) + cascaded memory architecture | Med |
| **Nomi.ai** | **Three-tier memory** (short/mid/long-term, 1,000+ message retention); up to **10 Nomis** with independent personality/backstory/memory; **group chat** (multiple Nomis interact with each other); **9.4/10 EQ** rating; voice calls (latency optimized to 1–1.5s Jan 2026); AI selfie (real-time appearance/clothing/environment); **Proactive Messaging** (context-aware,4 frequency levels: Very Frequent ~1hr, Frequent ~3hr, Normal ~1/day, Infrequent ~4 days; quiet hours 10PM-8AM; per-character customization; paid only $15.99/mo) | Group-chat + voice call + **granular proactive messaging** with quiet hours + multi-character with independent memories | Med–High |
| **Chai** | Mobile chat-first, message memory, personality customization, monetized chat | Mass-market chat UX; low novelty | Low |
| **Zhumu / AI-tab** | Browser-sidekick memory + summarization of ongoing conversation, persisted context, proactive suggestions | **Proactive/ambient memory** — agent "remembers" and injects context over long sessions; overlaps #14 world-continues & dynamic-memory trend | Med |
| **Talkie / Soul (SoulGate)** | **10M+ users**, 730K+ Google Play reviews (4.5★); **50K+ new user-created characters daily**; rich character library (romantic partners, historical figures, anime, game characters); **two-way voice interaction** with per-character unique voices; memory system (remembers name, preferences, shared experiences); advanced character creation guide (personality, reaction style, speaking patterns, behavior in scenarios); gamified character cards; cross-platform (iOS/Android/web); moved family-friendly in 2025-2026 (strict mature-theme limits); free tier + Talkie+ ($9.99-$24.99/mo) | **Massive community-driven character ecosystem** (50K+ daily new chars) + **two-way voice with per-character voices** — confirms voice+character variety as table-stakes demand; relationship/affection meters from earlier marketing not confirmed in verified reviews | Low–Med |

**Cross-bucket trend A:** *persistent identity + memory across sessions + multi-modal (voice/image) output* is now table-stakes in consumer companion apps. Loop-lore's single-session memory budget is a gap.

---

## Bucket B — AI RPG / Narrative engines

| Platform | Concretely-named features | Loop-lore-relevant novelty | Diff |
| --- | --- | --- | --- |
| **AI Dungeon (current)** | Dynamic ongoing adventure, multiple scenario/world settings, character actions; *no built-in inventory/quest/stats tracking by default* — narrative driven via LLM context | **Inspiration point:** loop-lore's structured RPG (items/combat/quests) offers DB-persisted state that complements a prompt-driven approach — its explicit tracking is a differentiator worth keeping. | Low risk |
| **DreamGen** | **Game Mode** with preset scenarios (text-adventure style); **multi-character scenes** (5+ characters with independent personalities/motivations); multiple selectable AI models (different creativity/consistency/speed); **context window**: 5K (Starter) → 15K (Advanced) → 30K (Pro) tokens; human-AI collaborative story writing; AI image generation; **Scenario Codex** (world-building + character sheets); loose mature-theme restrictions; free plan available | Multi-character scene interaction (direct input for group-chat NPC scenes) + model-selection flexibility + context window as quality lever | Low–Med |
| **Holly / AI-GM tools** | **2026 AI GM landscape** splitting into distinct jobs: tactical RPG engines (Fables.gg — 100K+ players, 5e combat with battlemaps, world building tools, creator ecosystem, party multiplayer), story sandboxes (AI Dungeon — freedom over structure), speed-to-play (StoryRoll — invite-link multiplayer, AI runs the table), power-user tweaking (AI Realm — 8 storytelling models + 3 image generators, solo 5e campaigns), prep assistants (LoreKeeper — lore/worldbuilding/factions for human GMs). Common across all: persistent memory across sessions, character tracking (sheets/HP/inventory), combat/initiative tracking, dice mechanics, NPC management, world state persistence, multiplayer support. | **Agentic-GM pattern** — the "assistant as GM" loop-lore already builds (P2-D). Confirms roadmap direction. Key pull: tactical combat tracking (positioning/terrain/initiative), NPC memory + consequences, GM prep layer (encounter/bestiary/world-state synopsis). Encounter + bestiary generation = generative content for `battle`/`npcs` | Med |
| **StoryBee / Vega / unfolding narrative tools** | Streaming long-form story, user choice branches, chapter persistence, image accompaniment | Branch/choice UIs already covered by VN mode + #17 what-if branch; streaming by word/paragraph | Low |

**Cross-bucket trend B:** *GM-as-agent* + *encounter/world gen* turned into first-class generative features. **Strengthens loop-lore's existing P2-D assistant-GM + battle/npc generation epics** — no new epic needed, but RPG generation (encounter/bestiary/world-state synopsis) is a concrete pull candidate.

---

## Bucket C — Agentic / generative-agent & creative/multimodal pipelines

The highest-signal bucket for future differentiators.

| Platform / paradigm | Concretely-named features | Loop-lore-relevant novelty | Diff |
| --- | --- | --- | --- |
| **Inworld AI** | Character Engine: NPCs with long-term memory, goals, emotional state, multi-agent dialogue, build-once-deploy-everywhere, Unreal/MetaHuman SDK, no-code | **Autonomous NPC agent** = memory + goals + emotion + multi-agent. Direct input for `actors`/`npcs`/`battle` NPC-AI + multi-agent scenes. Loop-lore would implement as an **agent layer over its existing actor/lore/memory stack** | High |
| **Convai** | **Mimir 5-layer memory**: scene awareness (vision), short-term verbatim, medium-term LLM summaries, long-term consolidated (scored for importance), working memory (prompt composition); hybrid BM25+semantic search with recency decay; **Narrative Design** graph (sections, spatial/time/event triggers, AI decision points); **Action system** (Atomic: Move/PickUp/Drop/Dance; Complex: multi-step sequences with physical feasibility reasoning); **NeuroSync** (transformer-based, 52 ARKit blendshapes at 60fps, MIT-licensed); WebRTC <1.5s voice latency; HandsFree VAD; BYOLLM; free Unity+Unreal plugins; 15,000+ devs; **shipped games**: PUBG (KRAFTON+NVIDIA ACE), NARAKA: BLADEPOINT (NetEase) | **Agent memory architecture** (5-layer, directly informs memory-purge/decay) + **action system** (NPC executes multi-step tasks with reasoning) + narrative-design graph (scripted+generative hybrid) | High |
| **Generative agents (Stanford Smallville / AI Town / Conductor)** | **Three-pillar memory**: (1) Memory stream (timestamped observations + importance 1-10 LLM-assigned + last-accessed timestamp); (2) Retrieval scoring (recency×importance×relevance, roughly equal weights, exponential recency decay); (3) **Reflection** (when cumulative importance ~150 threshold → LLM synthesizes higher-level conclusions stored back in stream; reflections can reflect on reflections, creating layered structure: raw obs → low-level → high-level → durable personality patterns); 25 agents formed relationships, organized events autonomously; **ablation**: removing reflection → behavior degraded from coherent multi-day planning to repetitive context-free responses within 48 simulated hours | **Agent memory architecture** (recency×importance×relevance scoring + reflection) directly informs loop-lore's memory-purge/decay (#10/#12). The reflection threshold pattern is a concrete design for upgrading assistant memory writes | High |
| **Luma / Runway / Krea / Magnific / Comfy-hosted** | **Luma Master Reference Asset pattern**: multi-angle reference packs (front/rear/3/4/side/full-body/T-pose, one angle per image); structured blueprint text doc (LLM describes shape/proportions/colors/materials/key features); locked identity features list; controlled variations (change pose/angle only); early drift correction by re-anchoring to Master Reference; always re-anchor to Master Reference (latest variant ≠ source of truth). **Runway Gen-4** Act-One/Act-Two: drive character facial performances + full-body movements from reference video. **Krea**: real-time generation + style reference. | **Asset consistency pipeline** — keep a character's look across generated images via reference conditioning + locked identity features (#3 procedural assets, img-gen); in-chat image edit | High |
| **Google Veo / Gemini creative** | Multimodal generation, scene continuity, audio/music gen | Scene-consistent imagery + ambient audio (#3 adaptive soundscape) | High |

**Cross-bucket trend C (the strongest overall):**
1. **Agentic NPC autonomy** (memory + goals + autonomous action + multi-agent dialogue) — the dominant "agentic" theme across Inworld/Convai/generative-agents.
2. **World-state persistence across time + between sessions** ("living world") — generative-agents schedules, AID world continuity, Nomi shared worlds.
3. **Structured memory scoring (recency/importance/relevance) + reflection** — the agent-memory pattern that upgrades loop-lore's purge/decay.
4. **Multimodal output (voice/image/video) + asset consistency** — companion + creative platforms converge on character-consistent media.
5. **Ambient/proactive memory** (browser-sidekicks, persistent context) — background context injection.

---

## Loop-lore gap synthesis (new, beyond the 34 + 12)

These are the actionable pull-candidates from the emergent sweep, mapped to existing epics:

| # | Capability | Source platforms | Map to loop-lore | Priority (defer or 0.1.0) |
| --- | --- | --- | --- | --- |
| E1 | **NPC agent engine** (memory+goals+emotion+autonomy) | Inworld, Convai (Mimir 5-layer memory + action system), generative-agents | Extends `actors`, `npcs`, `battle` NPC-AI, `memory` — see open question 1 (defer, fold into existing actor/NPC epics) | P6+ (deferred) |
| E2 | **Agent memory scoring** (recency×importance×relevance + reflection) | Convai Mimir (importance scoring + hybrid BM25+semantic search with recency decay), **generative-agents** (3-pillar: memory stream + retrieval scoring + reflection; importance 1-10 LLM-assigned; reflection at ~150 cumulative importance threshold; reflections-on-reflections create layered personality), Kindroid (5-tier cascaded memory), RisuAI HypaMemory | Upgrades `memory` purge/decay (#10/#12); reflection threshold pattern directly applicable to assistant memory writes | P6+ |
| E3 | **Living-world between-session persistence + world-time** | AI Town, Nomi, AID | Extends `world_events`, `timeline`, #14 | P6+ |
| E4 | **Asset-consistency generation pipeline** (reference conditioning + in-chat edit) | **Luma** (Master Reference Asset pattern: multi-angle reference packs + structured blueprint text doc + locked identity features + controlled variations + early drift correction + always re-anchor to Master Reference), Runway (Act-One/Act-Two character performance driving), Krea (real-time generation + style reference), RisuAI dynamic-assets | Extends `assets` + img-gen epics, emotion avatars; **Master Reference Asset pattern** is a concrete, implementable design for character image consistency | Med — pull now |
| E5 | **Voice calls / live avatars + ambient audio** | Kindroid, Nomi, Convai | Candidate #2/#12 + #3 | P6+ |
| E6 | **Quick-Reply / event-driven automation** (auto-execute on startup/user/ai) | SillyTavern Quick Replies, RisuAI dynamic-* | Extends slash-commands (candidate #5) + regex (idea #6) — **cheap, pure frontend** | **0.1.0 quick win** |
| E7 | **Dynamic memory/messages** (assistant writes memory notes mid-response; multi-message) | RisuAI | Extends assistant tool-calling (already has tool_calls SSE) | **0.1.0 quick win** |
| E8 | **Proactive/ambient memory injection** | Zhumu, Nomi | Cross-chat memory UI (B8 in-flight) | P4 |

**Note on AI Dungeon:** a strong inspiration for the narrative-first, prompt-driven
adventure model. Loop-lore's complementary direction — structured, DB-persisted RPG
state (items/combat/quests) layered under generative narrative — means the two are
different philosophies, not rivals. No pull candidate from it; the structured-state
approach validates loop-lore's existing RPG backend as a differentiator.

---

## Research provenance

- SillyTavern, RisuAI, AI Dungeon: DeepWiki codebase queries (2026-08-14) — definitive.
- **Kindroid**: weavai.app review (2026-04-08), aichatexplorer.com review (2026-07), companionwise.com — verified five-tier cascaded memory, 47 settings, group chat, Away Proactive.
- **Nomi.ai**: weavai.app review (2026-04-08), nomi.ai/updates (memory expansion blog) — verified three-tier memory (1000+ messages), 10 Nomis, group chat, 9.4/10 EQ, proactive messaging (4 frequency levels + quiet hours).
- **DreamGen**: weavai.app review (2026-04-14), aicompanionguides.com — verified Game Mode, multi-character scenes, 5K-30K context windows, multiple AI models.
- **Convai v4**: ik3d.fr deep-dive (2026-03-31) — verified Mimir 5-layer memory, narrative design graph, action system, NeuroSync (MIT-licensed), WebRTC <1.5s, shipped games (PUBG, NARAKA), 15K+ devs.
- **Proactive messaging comparison**: weavai.app (2026-08-13) — verified Nomi/Replika/Kindroid proactive features, paywall structure, anti-spam mechanisms.
- Inworld AI: primary blog + press (raised $50M @ $500M, character engine features).
- **Generative agents (Park et al., 2023)**: https://arxiv.org/abs/2304.03442 (original paper) + https://www.subodhjena.com/blog/generative-agents-memory-stanford (2026-04-22, definitive code walkthrough with retrieval scoring + reflection code examples) — verified 3-pillar architecture, reflection threshold, ablation results.
- **Luma** (Master Reference Asset pattern for character consistency): https://lumalabs.ai/learning-center/articles/character-and-object-consistency (2026-03-09) — verified from Luma Labs official learning center.
- **Talkie/Soul**: weavai.app review (2026-04-17) — verified 10M+ users, two-way voice, memory system, 50K+ daily new characters, gamified cards. Relationship/affection meters from earlier marketing NOT confirmed in verified reviews.
- **AI GM landscape**: storyroll.app comparison (2026-06-05) — verified Fables.gg (100K+ players, tactical 5e), StoryRoll (speed-to-play), AI Realm (8 models), RoleForge (maps+dice), LoreKeeper (prep assistant).
- Chai, Zhumu: commercial marketing surfaces (unverified, directional).

## Open questions

1. **Agentic-NPC epic**: build first-class or defer behind existing `actors`/`npcs`? Recommend **defer P6+** and fold into existing actor/NPC epics (no new epic now).
2. **Which quick wins land in 0.1.0**: E6 (Quick Replies) and E7 (dynamic memory/messages) are cheap and on-theme — see `backlog/priority.md` quick-win section.
3. Re-visit when web search providers are credentialed — many platform feature pages unreadable from datacenter IP.
