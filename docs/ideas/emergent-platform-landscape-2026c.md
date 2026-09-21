<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Emergent Platform Landscape III — Refresh Sweep: AI RPG & RAG Platforms (2026-09)

**Created:** 2026-09-21
**Purpose:** Refresh of the two prior sweeps (`emergent-platform-landscape-2026.md`, `-2026b.md`) — the inspiration corpus was ~1 month stale. Two buckets re-swept via primary sources (changelogs/release notes/official blogs): **AI RPG / narrative / companion platforms** and **RAG / knowledge / memory platforms**. Method: web research by two citation-carrying scouts; every claim URL-verified 2026-09-21; shipped-vs-announced tagged; already-planned items one-lined, not re-reported.

---

## Bucket F — AI RPG / narrative / companion refresh

Previously reviewed platforms (2026-08 → 2026-09 window):

| Platform | Status | Notes |
| --- | --- | --- |
| DreamRunner.ai | Quiet | No posts after Jun 25, 2026 (voice design/POV memory/stop-and-respond — already adopted as candidates #27–32). https://dreamrunner.ai/blog/ |
| Neta Studio | Incremental | Aug–Sep: multi-file world import by drag-drop (v0.2.2.55), inline entity references in chat messages (v0.2.2.48), Adventure reply-length/deeper-thinking/dialogue-style settings. https://neta.art/changelogs |
| Character.AI | **Materially changed** | **(c.ai) Series microdramas**: in-house short-form vertical series on platform-native characters (~Jul 9, 2026); viewers can chat with characters post-episode. https://blog.character.ai (corroborated: TechCrunch/Forbes/Variety, Jul 9, 2026) |
| Nomi.ai / Kindroid / Talkie | Quiet | No new mechanics in window (updates pages + store listings read). |
| AI Dungeon | Incremental | "Gauntlet" survival-milestone update (higher-stakes consequences). https://aidungeon.com/gauntlet |
| Inworld / Convai / Fables.gg / StoryRoll / AI Realm / LoreKeeper / miku.gg / story-studio.ai | Quiet / not found | No primary-source updates in window. |

New entrants:

| Platform | What it is | Evidence |
| --- | --- | --- |
| **TableForge** (tableforge.gg) | AI DM for D&D 5e: deterministic SRD 2024 rules engine under LLM narration; cross-session persistent campaign memory (NPCs, secrets, promises); auto-generated per-scene tactical maps with live player positioning; scene music; per-NPC voices; host-subscribes/guests-free multiplayer | https://tableforge.gg (+ /blog, read 2026-09-21) |
| **wilds.ai** | AI roleplay with vendor-positioned "cognitive" structured NPC memory (vs fact-extraction) | https://wilds.ai [UNVERIFIED beyond marketing] |
| **The Endlessness** | Campaign-document (PDF/DOCX) import → private playable worlds | https://theendlessness.com [UNVERIFIED — vendor claims] |
| **DungeonsDeep.ai** | Visual tabletop + AI GM (self-described) | https://dungeonsdeep.ai [UNVERIFIED] |

Verdicts vs loop-lore plan: deterministic-rules-under-narration = loop-lore's existing structured-RPG philosophy (validated, not new); cross-campaign memory = `epic-memory-propagation`; tactical maps + positioning = `epic-2d-sprite-world` + seeded-procgen tickets; stakes/permadeath = `epic-player-state-machine` revive modes + `docs/spec/worlds.md` `DeathPenalty`; campaign-doc→world import = `TASK-text-to-visual-novel-importer`; multi-file world import + inline entity references = io-formats + mention system + `TASK-hash-mention-retrieval-ux-for-chat-context`; cognitive memory = agent-memory-scoring track. **Genuinely new: post-episode character chat** (scripted episode hands off to live conversation with its characters) → filed as IDEA.

---

## Bucket G — RAG / knowledge / memory refresh

| Platform | Shipped in window (selected) | Evidence |
| --- | --- | --- |
| Open WebUI v0.11.1–3 | Per-call HITL tool approval; built-in `ask_user` MC-clarification tool (survives reload); chunked delta streaming w/ server-persisted in-progress replies; link-paste content sniffing → real attachments; open-at-page document citations; multi-turn request filter hook | https://github.com/open-webui/open-webui/releases/tag/v0.11.1 , /v0.11.2 |
| RAGFlow v0.27.2 | Agentic retrieval refactor; knowledge-compilation runtime settings + rate limiting; sitemap ingestion; Excel-cell / EPUB citation previews; retrieval-testing hit highlighting | https://github.com/infiniflow/ragflow/releases/tag/v0.27.2 |
| AnythingLLM v1.16.0 | Mid-session agent tool toggling; end-to-end generation abort; path-preserving folder upload; Gitea/GHE connectors | https://github.com/Mintplex-Labs/anything-llm/releases/tag/v1.16.0 |
| Onyx v4.8.0-beta.0 | Consent-gated re-embedding/index migration flow (pre-flight modal, in-flight cleanup, old-index reclaim); search exposed as named MCP agent; Zoom transcript ingestion | https://github.com/onyx-dot-app/onyx/releases/tag/v4.8.0-beta.0 |
| LibreChat v0.8.8-rc3 | Trace viewer; summarize-only compaction turn; ask-user answers carried past compaction; opt-in text fallback for unparseable uploads; agent CRUD API | https://github.com/danny-avila/LibreChat/releases/tag/v0.8.8-rc3 |
| Mem0 v2.1.0 | Caller-chain identity headers (`X-Mem0-Source`/`X-Mem0-Client` append-only stack) for memory-op attribution | https://github.com/mem0ai/mem0/releases/tag/v2.1.0 |
| Zep | MCP memory tools gain human-readable titles + read-only/destructive hint annotations [snippet-verified] | https://help.getzep.com |
| Letta | Stalled at v0.16.8 (May 2026) — no new memory semantics in window | https://github.com/letta-ai/letta/releases |

Verdicts vs loop-lore plan: HITL approval = `TASK-human-in-the-loop-tool-approval-gates`; compaction summarize-turn + ask-user carry = `TASK-chat-feature-context-memory-events` (already cites the LibreChat precedent); citations/chips/click-telemetry = `TASK-rag-citation-display` + `epic-rag-evaluation-observability`; link sniffing/URL ingestion = `epic-rag-context-sources` URL decomposer + hash-mention ticket; re-indexing = `epic-rag-enterprise` lifecycle + bulk reindex (consent/pre-flight UX recorded as refinement bullet below); MCP agent exposure = candidate #19 + `TASK-workspace-mcp-bridge`; tool toggling/abort = plugin-management + shipped stop-generation. **No new RAG-semantics paradigm shipped in the window** — packaging, preview, and safety-UX polish only. Recorded refinements (no tickets; fold into owning epics when their work starts): citation→source-location deep links in preview (rag-ui), retrieval-testing hit highlighting (rag-evaluation), consent pre-flight UX for embedding swaps (rag-enterprise), memory-API caller-identity headers + destructive-op hint annotations (memory/RAG observability).

---

## New gap filed from this sweep

| # | Capability | Source | Ticket |
| --- | --- | --- | --- |
| E17 | **Post-episode character chat** — scripted microdrama episode hands off to live conversation with the episode's characters (viewer continues inside the fiction) | Character.AI (c.ai) Series (Jul 2026) | IDEA-microdrama-post-episode-chat-handoff.md |

Provenance: scout transcripts `agent://ScoutRPGRefresh`, `agent://ScoutRAGRefresh` (2026-09-21); verification dates per-entry above.
