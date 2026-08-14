# EPIC: Platform Research & Feature Adoption (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** Medium
**Effort:** Continuous
**Type:** Ongoing Epic

## Summary

Research and implementation of features from other platforms (SillyTavern, RisuAI, Character.AI, etc). Continuously evaluate and adopt useful features.

## Scope

- Monitor competitor/community platforms for new features
- Evaluate feature applicability to loop-lore
- Implement high-value features
- Maintain compatibility with existing formats
- Community feedback integration

## Research Areas

- SillyTavern feature parity
- RisuAI innovations
- Character.AI UX patterns
- Community-requested features
- Industry best practices

## Linked Tasks

| Task                         | Title                   | Priority | Status      |
| ---------------------------- | ----------------------- | -------- | ----------- |
| TASK-conversation-branching  | Conversation branching  | Medium   | Not Started |
| TASK-character-relationships | Character relationships | Medium   | Not Started |
| TASK-prompt-library          | Prompt library          | Low      | Not Started |

## Files

- `docs/research/` — research documents
- `docs/spec/` — feature specifications
- `docs/frontend/` — UX specifications

## Analysis & Current State (2026-07)

**Gap:** `docs/research/` (referenced as the research store) currently contains **no documents** — the epic has scope but no backing research yet. This epic should seed `docs/research/` with one-pager evaluations per candidate feature below.

loop-lore already covers (do NOT re-research): multi-LLM story/GM, character cards, lorebooks/worlds, assets, assistant, roles/sessions, group chat, encryption, age gate, plugins (loader only).

## Candidate Features (research-backed, prioritized)

| #  | Feature                                 | Source                   | Why it matters                                                                               | Difficulty |
| -- | --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- | ---------- |
| 1  | RAG / Vector Memory (embeddings)        | SillyTavern Data Bank    | Semantic recall beyond keyword lorebooks; pgvector (PG) or in-process (SQLite)               | High       |
| 2  | TTS & Voice Synthesis (streaming)       | SillyTavern TTS/XTTS     | Immersion; audio streaming to htmx client                                                    | Med        |
| 3  | Image-Generation Pipelines (SD/ComfyUI) | SillyTavern              | Generate in-chat art; needs queue + caption hook                                             | High       |
| 4  | Character Card V3 Spec                  | SillyTavern/RisuAI/Chub  | `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, embedded assets | Low–Med    |
| 5  | Slash-Command System                    | SillyTavern              | Power-user macros for context/gen manipulation                                               | Med        |
| 6  | Emotion / Reaction System               | RisuAI                   | LLM emotion tag → portrait/emote swap                                                        | Med        |
| 7  | Mobile / PWA                            | SillyTavern/Character.AI | Installable offline app; responsive layout                                                   | Med        |
| 8  | Auto Image Captioning                   | SillyTavern              | Vision model alt-text → feeds RAG/lorebooks                                                  | Low–Med    |
| 9  | Translation & i18n                      | SillyTavern              | On-the-fly message translation + UI locales                                                  | Med        |
| 10 | Sandboxed Plugin Marketplace            | SillyTavern/RisuAI       | Curated repo + hardened plugin API (security sandbox)                                        | High       |
| 11 | Cross-Session Editable Memories         | Character.AI (2025)      | User-curated facts persisted across chats                                                    | Low–Med    |
| 12 | Voice Calls / Live Avatars              | Character.AI             | Full-duplex voice + talking avatar                                                           | High       |

**Lower priority / already-derivable:** dynamic world-state/weather (GM mode covers), group chat (done).

## Emergent-platform sweep (2026-08-14) — RPG / agentic / creative

The 12 candidates above were researched against the reviewed open-source set
(SillyTavern, RisuAI, Agnai, Chub, NovelAI, Open WebUI, KoboldCpp). This section extends
that analysis to the **ad-visible commercial RPG / agentic / creative platforms** that
now dominate the market — treated as **inspiration sources**, not competitors. Full
feature lists + gap synthesis: `docs/ideas/emergent-platform-landscape-2026.md`.

New candidate features (foldup: keep these tracked here until a dedicated epic is split
out; agentic-NPC recommended P6+ deferred into existing `actors`/`npcs`):

| # | Feature (from emergent platforms)              | Inspiration source                 | Why it matters for loop-lore                                                              | Difficulty |
| -- | ---------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| 13 | Agentic NPC autonomy (memory+goals+emotion+action) | Inworld AI, Convai (Mimir 5-layer memory: scene awareness + short-term verbatim + medium-term summaries + long-term consolidated (importance-scored) + working memory; hybrid BM25+semantic search w/ recency decay; action system: Atomic (Move/PickUp/Drop) + Complex (multi-step with physical feasibility reasoning); narrative design graph: spatial/time/event triggers + AI decision points), generative-agents | NPCs act on own goals/memory → turns `npcs`/`battle` NPC-AI from scripted to agentic. P6+ deferred (open question 5) | High |
| 14 | Agent-memory scoring (recency×importance×relevance + reflection) | Convai Mimir (importance scoring + hybrid BM25+semantic search with recency decay), generative-agents, RisuAI HypaMemory, Kindroid (5-tier cascaded memory: diary → key memories → summaries → emotional patterns → cascaded combined) | Upgrades loop-lore `memory` purge/decay toward a proven scoring model. P6+ | High |
| 15 | Living-world between-session persistence + world-time | AI Town / Conductor, Nomi, AI Dungeon | "World continues without you" (#14) + `world_events`/`timeline` continuity. P6+       | Med |
| 16 | Asset-consistency generation (reference conditioning + in-chat edit) | Luma, Runway, Krea, RisuAI dynamic-assets | Keep a character's look across generated images; in-chat img-edit. **Med — pull now** (ideal 0.1.0/later wave) | Med |
| 17 | Quick-Reply / event-driven automation (auto-execute on startup/user/ai) | SillyTavern Quick Replies, RisuAI dynamic-* | Event-triggered slash-command/regex automation — **cheap, pure frontend**, on-theme quick win | Med |
| 18 | Dynamic memory/messages (assistant writes memory notes mid-response; multi-message) | RisuAI | Extends the shipped tool-call SSE (`messages.tool_calls`) toward durable in-chat memory writes — quick win | Med |

**Cross-platform trends (strongest adoption signals):**
- **A — Agentic NPC autonomy** (memory + goals + multi-agent dialogue): Inworld/Convai/generative-agents
- **B — Living-world persistence across time + between sessions**: generative-agents schedules, Nomi shared worlds, AI Dungeon continuity
- **C — Multimodal output + asset consistency** (voice/image/video, character-consistent media)
- **D — Ambient/proactive memory** (browser-sidekicks, persistent context injection)

**Positioning note:** the narrative-first model (AI Dungeon) and loop-lore's structured,
DB-persisted RPG state (items/combat/quests) are different philosophies, not rivals —
loop-lore's structured backend is a differentiator. See landscape doc for the full
respectful treatment.

## Open Questions

1. Build vs. buy: which features are worth first-class implementation vs. plugin-extension surface only? (Ties to plugin epic + epic 25 deployment packaging for external engines like ComfyUI/SD.)
2. Adoption order: RAG (High effort) vs. V3 cards / slash-commands (Low–Med, quick wins) — sequence by ROI?
3. External engines (image gen, TTS, embeddings) need out-of-process orchestration — belongs in loop-lore core or as a plugin/sidecar? (See epic 25 topologies C/D.)
4. Should `docs/research/` be seeded now with the 12 one-pagers, or track as tasks first?
5. **Agentic-NPC (candidate 13)**: build first-class or defer behind existing `actors`/`npcs`? Recommended **defer P6+** and fold into existing actor/NPC epics — no new epic now. Same for agent-memory scoring (14) + living-world (15).

## Research / References

- SillyTavern Data Bank / Vector Storage: https://docs.sillytavern.app/usage/core-concepts/data-bank/ · https://deepwiki.com/SillyTavern/SillyTavern/6.3-vector-storage-and-rag-system
- SillyTavern TTS: https://docs.sillytavern.app/extensions/tts/
- SillyTavern Image Gen: https://deepwiki.com/SillyTavern/SillyTavern/8.2-image-generation-extensions
- Character Card V3: https://tinyland.ai/docs/advanced/character-card-v3 · V2: https://github.com/malfoyslastname/character-card-spec-v2
- Slash commands: https://deepwiki.com/SillyTavern/SillyTavern/7.1-slash-command-system
- RisuAI: https://risuai.net/
- Character.AI memories: https://blog.character.ai/helping-characters-remember-what-matters-most/
- **Emergent platform sweep (2026-08-14):** `docs/ideas/emergent-platform-landscape-2026.md` (Buckets A/B/C + E1–E8 gap synthesis)
- Inworld AI: https://inworld.ai/blog/ai-npcs-and-the-future-of-video-games
- Generative agents: https://arxiv.org/abs/2304.03442 (Stanford generative agents) · AI Town: https://github.com/a16z-infra/ai-town
- AI Dungeon: https://deepwiki.com/latitudegames/AIDungeon
- RisuAI memory systems (HypaMemory/SuperMemory) + dynamic-* automation: https://deepwiki.com/kwaroran/RisuAI
- **Convai v4** (Mimir memory, action system, NeuroSync): https://ik3d.fr/convai-v4-neurosync-your-game-npcs-just-learned-to-talk-remember-and-feel/ (2026-03-31) — definitive, verified against Unity/Unreal plugin release notes
- **Kindroid** (5-tier cascaded memory, 47 settings, group chat, Away Proactive): https://weavai.app/blog/en/2026/04/08/kindroid-ai-review-2026-full-analysis-of-five-tier-memory-system-voice-calls-and-personalized-ai-companions/ — verified review
- **Nomi.ai** (3-tier memory, 10 Nomis, group chat, proactive messaging): https://weavai.app/blog/en/2026/04/08/nomi-ai-review-2026-full-analysis-of-three-tier-memory-system-voice-calls-and-ai-companion-features/ + https://weavai.app/blog/en/2026/08/13/proactive-ai-companions-nomi-replika-kindroid-compared/ — verified
- **DreamGen** (Game Mode, multi-character scenes, Scenario Codex): https://weavai.app/blog/en/2026/04/14/dreamgen-2026-review-ai-story-features-pricing/ — verified review
- **Generative agents** (Park et al., 2023 — 3-pillar memory: memory stream + retrieval scoring + reflection): https://arxiv.org/abs/2304.03442 + https://www.subodhjena.com/blog/generative-agents-memory-stanford (2026-04-22, code walkthrough)
- **Luma** (Master Reference Asset pattern for character consistency): https://lumalabs.ai/learning-center/articles/character-and-object-consistency (2026-03-09, official learning center)

## Research Reconciliation (2026-08-14)

Research on agentic NPC systems (Inworld AI, generative-agents, Convai, RisuAI) identified 8 extensions that map to platform candidates E1-E3 and E5. Tickets generated for all uncovered topics.

### Extension → Candidate → Ticket Map

| Research Extension | Platform Candidate | Priority | New Ticket | Existing Ticket Updated |
|---|---|---|---|---|
| PAD Emotional Model | E1 (Agentic NPC) | P6+ | — | TASK-character-mood-happiness.md ✅ |
| Memory Architecture (4-tier) | E2 (Memory scoring) | P6+ | TASK-agent-memory-scoring.md ✅ | FEAT-memory-systems-three-tier.md ✅ |
| NPC-to-NPC Social Sim | E1 (Agentic NPC) | P6+ | TASK-npc-to-npc-social.md ✅ | TASK-social-interaction.md ✅ |
| BDI Goal-Pursuit Loop | E1 (Agentic NPC) | P6+ | TASK-npc-bdi-planning.md ✅ | TASK-npc-behavior.md ✅ |
| Voice & Speech Profiles | E5 (Voice/Avatars) | Med | TASK-character-voice-profile.md ✅ | — |
| Dynamic Relationships | E1 (Agentic NPC) | P6+ | — | TASK-character-relationships.md ✅ |
| Character Growth | E1 (Agentic NPC) | Med | TASK-character-growth-development.md ✅ | — |
| Living-World Persistence | E3 (World-time) | P6+ | TASK-living-world-persistence.md ✅ | — |

### Integration Matrix Gaps Added

11 new gaps (G27-G37) added to `cross-mechanics-integration-matrix.md`:
- BDI Planning ↔ Internal Traits (G27), Mood (G28)
- NPC-to-NPC Social ↔ Relationships (G29), Memory (G30)
- Agent Memory Scoring ↔ Emotion Impact (G31)
- Living-World ↔ BDI Planning (G32), Relationships (G33)
- Voice Profile ↔ Mood (G34), Character Growth (G35)
- Character Growth ↔ Internal Traits (G36), Relationships (G37)

### Platform Trend Validation

Research confirms four cross-platform trends identified in the emergent platform sweep:
- **A — Agentic NPC autonomy** (E1): Inworld, Convai, generative-agents — strongest signal
- **B — Living-world persistence** (E3): AI Town, Nomi, AID — validates "world continues without you"
- **C — Structured memory scoring** (E2): generative-agents, RisuAI HypaMemory — upgrades purge/decay
- **D — Voice/multimodal output** (E5): Kindroid, Nomi, Convai — voice profiles are foundation

### Recommendation

All 8 extensions are **P6+ deferred** except Voice Profiles and Character Growth (medium priority, can pull earlier). Fold into existing actor/NPC/memory epics when P6+ work starts — no new epic needed.

## Agentic Features Deep-Dive (2026-08-14) — One-by-One Platform Analysis

Systematic analysis of agentic features across 9 platforms to enhance assistant defaults and extend chat/roleplay functionalities.

### Platform-by-Platform Findings

#### 1. Inworld AI — Character Engine
- **Personality Builder**: define backstory, goals, knowledge boundaries, emotional profile in no-code Studio
- **Persistent NPC Memory**: remembers player history across sessions, reacts differently per player
- **Goal-Driven Behavior**: NPCs pursue autonomous goals, not just respond to prompts
- **Emotional Reasoning**: emotional state affects dialogue and behavior
- **Real-Time Dialogue**: low-latency text+voice with multilingual support
- **Knowledge Base Grounding**: NPCs answer from connected knowledge, not just LLM hallucination
- **Safety Guardrails**: configurable content boundaries per character
- **Loop-lore gap**: `assistant` already has rules/commands but lacks goal-driven autonomy and emotional reasoning. **Map to**: assistant epic + character-core-system (mood/emotion integration)

#### 2. Convai — Agentic Architecture
- **Dual-Mind Architecture**: reactive mind (instant responses) + reasoning mind (chain-of-thought planning)
- **Always Listening/Seeing**: agents perceive continuously, decide when to respond proactively
- **Long-Term Memory + Inner Monologue**: agents "think" even when silent, maintain persistent memory
- **Contextual Animation Selection**: agents choose actions/animations based on role and context
- **Group Dynamics**: agents in a scene take turns intelligently, multi-party interactions
- **Tool-Calling Agents**: agents invoke external tools/services via MCP-style connectors
- **Proactivity Controls**: tune how proactive vs reactive an agent is
- **Loop-lore gap**: `assistant` lacks proactive behavior, inner monologue, and tool-calling integration. **Map to**: assistant epic (proactive mode) + turn orchestration (inner monologue) + plugin system (tool-calling)

#### 3. Kindroid — Five-Tier Cascaded Memory
- **Cascaded Memory** (patented): (1) stored diary, (2) key memories, (3) conversation summaries, (4) emotional pattern tracking, (5) cascaded combined layer
- **Learned Context**: growth & relationship tracking, important facts, ongoing context
- **Journal Entries**: keyphrase-triggered retrievable memory (up to 8 keyphrases, 3 recalled per message)
- **Global vs Individual Journals**: global entries shared across all characters
- **47 Per-Companion Settings**: granular personality customization
- **Group Chat**: characters talk to each other with independent memories
- **Away Proactive**: context-aware proactive messaging with anti-spam brake
- **Loop-lore gap**: `memory` has three-tier but lacks emotional pattern tracking and keyphrase-triggered recall. **Map to**: memory epic (emotional pattern tracking, keyphrase recall) + character-core-system (Learned Context)

#### 4. RisuAI — Dynamic Automation
- **HypaMemory V2/V3**: vector-based memory with recency×importance scoring
- **SuperMemory**: LLM-summarized chat compression for context management
- **Hanurai Memory**: alternative memory system with different retrieval
- **Emotion Images**: LLM emotion tags → portrait/emote swap
- **Dynamic Assets**: persistent multimedia storage with vector similarity search
- **Scripting System**: custom JavaScript/TypeScript scripts for automation
- **Regex Pipeline**: pattern detection and text manipulation (similar to loop-lore's extraction pipeline)
- **Module/Plugin System**: extensible via modules
- **Loop-lore gap**: `memory` lacks vector-based scoring (HypaMemory pattern). **Map to**: memory epic (agent-memory-scoring ticket) + regex/assistant (scripting parity)

#### 5. Nomi.ai — Proactive Messaging
- **Three-Tier Memory**: short/mid/long-term with 1,000+ message retention
- **Proactive Messaging**: 4 frequency levels (Very Frequent ~1hr → Infrequent ~4 days), per-character customization
- **Quiet Hours**: configurable do-not-disturb (10PM-8AM default)
- **Group Chat**: multiple Nomis interact with each other independently
- **Emotional Intelligence**: picks up on and remembers user preferences
- **Independent Memories**: each character maintains separate memory
- **Loop-lore gap**: `assistant`/`chat` lacks proactive messaging and quiet hours. **Map to**: notifications epic (proactive messaging) + assistant (quiet hours) + group-chat (inter-character dialogue)

#### 6. AI Dungeon — Narrative-First
- **Dynamic Adventure**: ongoing story generation with world-state tracking
- **Memory System**: context-window-based with pinning and summarization
- **World Persistence**: world continues between sessions
- **Character Actions**: LLM interprets player intent from natural language
- **Loop-lore gap**: loop-lore's structured RPG state (items/combat/quests) is a differentiator over prompt-driven approach. **Map to**: existing RPG epics (validate structured-state approach)

#### 7. Generative Agents (Stanford Smallville) — Reference Architecture
- **Memory Stream**: timestamped log of all observations with importance scores (1-10)
- **Retrieval Scoring Function**: `score = recency_decay + importance/10 + embedding_similarity` (roughly equal weights)
- **Reflection**: periodic synthesis of observations into higher-level conclusions; reflections stored back in stream
- **Layered Memory**: raw observations → low-level reflections → higher-level reflections → durable personality conclusions
- **Reflection Threshold**: fires when cumulative importance exceeds ~150 points
- **Social Simulation**: agents form relationships, organize events, spread invitations autonomously
- **Daily Schedules**: agents plan and execute routines based on memory
- **Loop-lore gap**: `memory` lacks reflection mechanism and importance-based scoring. **Map to**: memory epic (reflection system, importance scoring) + agent-memory-scoring ticket

#### 8. Character.AI — Memory UI
- **Memory UI**: visual memory management with pinning and custom facts
- **Facts System**: user-curated facts persisted across chats (c.ai+ feature)
- **Memory Usage Visualization**: shows what's filling up context
- **Stories**: visual adventure mode with branching
- **Group Chat**: multiple characters in conversation
- **PipSqueak**: new reasoning model for better context understanding
- **Loop-lore gap**: `memory` lacks visual memory management UI. **Map to**: memory selection UI ticket (already exists) + character-core-system (facts system)

#### 9. SillyTavern — Automation Power-User
- **Quick Reply System**: event-triggered slash-command automation (startup, user message, AI message)
- **Tool Calling**: LLM invokes external functions during generation
- **Regex Pipeline**: pattern detection and text manipulation
- **Data Bank**: vector storage for RAG
- **TTS/STT**: voice synthesis and recognition
- **Image Generation**: in-chat art generation
- **Loop-lore gap**: `assistant`/`regex` already cover some automation but lack event-driven triggers. **Map to**: assistant epic (event-driven automation) + E6/E7 quick-win candidates

### Cross-Platform Agentic Feature Synthesis

| Agentic Feature | Platforms | Loop-lore Status | Priority |
|---|---|---|---|
| **Goal-driven NPC autonomy** | Inworld, Convai, generative-agents | ❌ Not started | P6+ |
| **Reflection/memory synthesis** | generative-agents, Kindroid | ❌ Not started (agent-memory-scoring ticket exists) | P6+ |
| **Proactive messaging** | Nomi, Kindroid | ❌ Not started | Med |
| **Emotional pattern tracking** | Kindroid, Inworld | ❌ Not started (emotion-impact ticket exists) | Med |
| **Keyphrase-triggered recall** | Kindroid (journals) | ❌ Not started | Low-Med |
| **Inner monologue** | Convai | ❌ Not started | P6+ |
| **Tool-calling agents** | Convai, SillyTavern | ❌ Not started | Med |
| **Event-driven automation** | SillyTavern (QR), RisuAI | ❌ Not started (E6 candidate) | **0.1.0 quick win** |
| **Dynamic memory writes** | RisuAI | ❌ Not started (E7 candidate) | **0.1.0 quick win** |
| **Importance-based scoring** | generative-agents, RisuAI HypaMemory | ❌ Not started (agent-memory-scoring ticket) | P6+ |
| **Visual memory management** | Character.AI | ❌ Not started (memory selection UI ticket) | Med |
| **Quiet hours** | Nomi | ❌ Not started | Low |
| **Group inter-character dialogue** | Kindroid, Nomi, DreamGen | ❌ Not started | Med |

### New Candidate Features (from deep-dive)

| # | Feature | Source | Why it matters | Difficulty |
|---|---|---|---|---|
| 19 | **Reflection/memory synthesis** | generative-agents, Kindroid | Periodic synthesis of observations into higher-level conclusions; upgrades purge/decay | High |
| 20 | **Proactive messaging** | Nomi, Kindroid | Assistant messages user proactively based on context; quiet hours | Med |
| 21 | **Emotional pattern tracking** | Kindroid | Track emotional patterns across conversations; feed into mood system | Med |
| 22 | **Keyphrase-triggered recall** | Kindroid (journals) | Recall memories by keyphrase match; reliable retrieval for important facts | Low-Med |
| 23 | **Inner monologue** | Convai | Agent "thinks" even when silent; generates internal observations | High |
| 24 | **Tool-calling agents** | Convai, SillyTavern | Agents invoke external tools/services during generation | Med |
| 25 | **Visual memory management** | Character.AI | UI for viewing, pinning, editing memories; memory usage visualization | Med |
| 26 | **Quiet hours / do-not-disturb** | Nomi | Configurable time windows when assistant won't proactively message | Low |

### Recommendation

**0.1.0 quick wins** (pull now): Event-driven automation (E6), Dynamic memory writes (E7), Keyphrase-triggered recall (#22), Quiet hours (#26)

**Medium priority** (0.1.0/later wave): Proactive messaging (#20), Emotional pattern tracking (#21), Visual memory management (#25), Tool-calling agents (#24)

**P6+ deferred**: Reflection/memory synthesis (#19), Inner monologue (#23), Goal-driven NPC autonomy (existing E1)

## Related Epics

- **Epic World & Locations** — world style / style-specific asset & NPC generation are adoption candidates tracked here.
- **Epic RPG Mechanics** — RPG systems (dice, combat, loot, quests) are direct adoption targets.
- **Epic Battle & Action Systems** — combat, trading, skill-checks adoption tracked here.
- **Image-Generation / TTS / RAG** — candidates #1/#2/#3 in this epic; **no dedicated epics exist yet** — keep adoption tracked here until split out.
