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

## Open Questions

1. Build vs. buy: which features are worth first-class implementation vs. plugin-extension surface only? (Ties to plugin epic + epic 25 deployment packaging for external engines like ComfyUI/SD.)
2. Adoption order: RAG (High effort) vs. V3 cards / slash-commands (Low–Med, quick wins) — sequence by ROI?
3. External engines (image gen, TTS, embeddings) need out-of-process orchestration — belongs in loop-lore core or as a plugin/sidecar? (See epic 25 topologies C/D.)
4. Should `docs/research/` be seeded now with the 12 one-pagers, or track as tasks first?

## Research / References

- SillyTavern Data Bank / Vector Storage: https://docs.sillytavern.app/usage/core-concepts/data-bank/ · https://deepwiki.com/SillyTavern/SillyTavern/6.3-vector-storage-and-rag-system
- SillyTavern TTS: https://docs.sillytavern.app/extensions/tts/
- SillyTavern Image Gen: https://deepwiki.com/SillyTavern/SillyTavern/8.2-image-generation-extensions
- Character Card V3: https://tinyland.ai/docs/advanced/character-card-v3 · V2: https://github.com/malfoyslastname/character-card-spec-v2
- Slash commands: https://deepwiki.com/SillyTavern/SillyTavern/7.1-slash-command-system
- RisuAI: https://risuai.net/
- Character.AI memories: https://blog.character.ai/helping-characters-remember-what-matters-most/

## Related Epics

- **Epic World & Locations** — world style / style-specific asset & NPC generation are adoption candidates tracked here.
- **Epic RPG Mechanics** — RPG systems (dice, combat, loot, quests) are direct adoption targets.
- **Epic Battle & Action Systems** — combat, trading, skill-checks adoption tracked here.
- **Image-Generation / TTS / RAG** — candidates #1/#2/#3 in this epic; **no dedicated epics exist yet** — keep adoption tracked here until split out.
