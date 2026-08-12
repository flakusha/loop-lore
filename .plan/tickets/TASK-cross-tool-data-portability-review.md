---
Status: 🟡 Analysis (investigation complete, not scheduled)
Priority: Medium
Effort: TBD (analysis only)
Type: Research / Portability Review
Tags: migration, integration, import, export, interop, characters, chats
Epic: epic-import-export-io.md
Linked Epics: epic-io-formats.md, epic-platform-integrations.md
Related: docs/ideas/index.md (gap summary refreshed 2026-08-12)
---

# Cross-Tool Data Portability Review (both directions)

**Status:** Analysis complete (2026-08-12). Informs follow-up tickets; not an
implementation task itself. Research sourced from SillyTavern, RisuAI, Agnai,
Chub, NovelAI, Open WebUI, KoboldCpp current (2025-2026) docs.

## Summary

loop-lore's character-card I/O already covers the community standard set
(CCv2/CCv3, Character.AI, TOML, YAML, CHARX, PNG) in **both directions** and is
interoperable with SillyTavern, RisuAI, and Chub. The real portability gaps are:

1. **Chat history is one-directional.** loop-lore exports only loop-lore-specific
   formats (Markdown / JSON / HTML / plain text). It neither exports a peer-consumable
   chat format (SillyTavern `.jsonl`, Agnai/Tavern JSONL) nor imports chat histories
   from any tool. Every peer imports chat histories; loop-lore imports none.
2. **Minor character-card gaps:** Agnai-native, ooba/Pygmalion/Charas, and NovelAI
   Card-V2 import normalizers missing; CHARX JPEG-hybrid + RCC-encrypted unhandled;
   World-Info/lorebook engine parity (inclusion groups, probability, outlets,
   automation IDs, regex keys) incomplete.
3. **RPG-native data (worlds/locations/NPCs/items/quests)** has no portable export in
   any peer — acceptable differentiation, out of scope for cross-tool migration.
4. **Image/TTS generation pipelines** absent in loop-lore (present in all peers) — a
   feature gap, not a migration gap.

## Current loop-lore state (verified in repo)

From `epic-import-export-io.md` (code-audit, fully implemented):

- **Import:** CCv2, CCv3, Character.AI, JSON-flat, TOML, YAML, CHARX, PNG (auto-detect).
- **Export:** CCv2, CCv3, PNG (dual chunks), YAML, TOML, CHARX.
- **Chat export:** Markdown, JSON, HTML, plain text (loop-lore-specific).
- **No chat import.** No world/location/npc/item export.

## Findings — peer capabilities (2025-2026)

- **SillyTavern** — ecosystem hub. Imports cards (CCv1/v2/v3 + PNG) and chats from
  TavernAI, oobabooga, Agnai, KoboldAI-Lite, RisuAI, Character.AI (CAI-Tools). Exports
  `.jsonl` (re-importable) + `.txt` (one-way). Extensions: TTS (15 providers), Dynamic
  Audio, Expression Images, Translate (8 providers), STscript (Turing-complete), Quick
  Replies, World Info (regex keys, inclusion groups, probability, outlets, automation),
  group chat, Live2D/VRM.
- **RisuAI** — widest card-format set: PNG V2/V3, JSON V2/V3, CHARX (+ JPEG hybrid),
  RCC-encrypted, `.risum` modules, `.risup`/RisuSave chats, Chub + RisuRealm hubs.
  Emotion images, 4-phase regex + `@@actions` + CBS, auto-translation, TTS, plugin/MCP
  ecosystem, SuperMemory/HypaMemory.
- **Agnai** — multi-bot/multi-user RPG/simulation. Imports Tavern V1/V2, ooba, Charas,
  CAI, Pygmalion; exports Tavern `.json`/PNG + ooba JSON; chat JSONL both ways;
  `MemoryBook` ↔ Tavern `character_book` conversion. Vector memory, dice grammar,
  scenario states.
- **Chub.ai** — distribution hub (not a runtime). Serves CCV2/CCV3/CharX; rich
  lorebook-v2 spec; chat trees; image gen; inference API; Venus frontend.
- **NovelAI** — closed. NAI Card-V2 spec + lorebook shape only actionable; no open
  chat/card interop. Benchmark for TTS, image Canvas, rich lorebooks.
- **Open WebUI** — chat JSON import/export (parentId/childrenIds tree) + native ChatGPT
  import; Tools/Functions/Pipes/MCP/OpenAPI plugins; agentic memory; hybrid RAG; TTS/STT.
- **KoboldCpp** — all-in-one local server (OuteTTS/Kokoro/Parler TTS, Whisper STT, SD
  image, CLIP, embeddings); KoboldAI-Lite World Info lorebook + story save/export slots.

## Bidirectional interop matrix

### Character cards

| Format                 | loop-lore | ST   | RisuAI | Agnai | Chub | NovelAI |
| ---------------------- | --------- | ---- | ------ | ----- | ---- | ------- |
| CCV2 PNG (`chara`)     | ✅✅      | ✅✅ | ✅✅   | ✅✅  | hub  | —       |
| CCV3 PNG (`ccv3`)      | ✅✅      | ✅✅ | ✅✅   | ≈    | hub  | —       |
| CHARX `.charx`         | ✅✅      | ✅✅ | ✅✅   | —    | hub  | —       |
| JSON V2/V3             | ✅✅      | ✅✅ | ✅✅   | ✅✅ | ✅   | —       |
| Tavern V1/V2           | ✅✅      | ✅✅ | ✅     | ✅✅ | ✅   | —       |
| YAML / TOML            | ✅✅      | —   | —     | —    | —   | —       |
| Character.AI           | ✅✅      | ✅  | —     | ✅   | —   | —       |
| Charas/Pyg/ooba        | —        | ✅  | —     | ✅   | —   | —       |
| NAI Card V2            | —        | —   | —     | —    | —   | ✅      |
| Lorebook (book/V2)     | ✅ partial| ✅✅ | ✅✅   | ✅✅ | hub  | ≈       |
| CHARX JPEG / RCC       | partial  | —   | ✅✅   | —    | —   | —       |

(✅✅ = import+export both; ✅ = one direction; ≈ = partial)

### Chat history

| Format                   | loop-lore | ST   | RisuAI | Agnai | Chub |
| ------------------------ | --------- | ---- | ------ | ----- | ---- |
| loop-lore MD/JSON/HTML   | export    | —   | —     | —    | —   |
| ST `.jsonl` (re-import)  | ❌ gap    | ✅✅ | —     | —    | —   |
| Agnai / Tavern JSONL     | ❌ gap    | ✅  | —     | ✅✅ | ✅   |
| RisuAI `.risup`/RisuSave | ❌ gap    | ✅  | ✅✅   | —    | —   |
| `.txt` (one-way)         | ❌ (add?) | ✅  | —     | —    | —   |

## Gaps (prioritized)

1. **Chat history import + export (both directions)** — highest-ROI migration gap.
   Target SillyTavern `.jsonl` + Agnai/Tavern JSONL. (loop-lore chat schema → JSONL
   export; JSONL/Agnai-native → loop-lore chat import.)
2. **World-Info / lorebook engine parity** — inclusion groups, probability, outlets,
   automation IDs, regex keys; full `.json` lorebook round-trip.
3. **Additional card import normalizers** — Agnai-native, ooba/Pygmalion/Charas,
   NovelAI Card-V2.
4. **CHARX JPEG-hybrid + RCC-encrypted** read/write.
5. **(Feature, not migration)** Auto-translation, TTS/voice, adaptive audio,
   plugin/extension API — covered by `docs/ideas/` gap items; no interop blocker.

## Proposed follow-up tickets

- [ ] `TASK-chat-history-import-export` — ST `.jsonl` + Agnai/Tavern JSONL, both directions
- [ ] `TASK-worldinfo-engine-parity` — inclusion groups, probability, outlets, automation, regex keys
- [ ] `TASK-additional-card-imports` — Agnai, ooba/Pygmalion/Charas, NAI Card-V2
- [ ] `TASK-charx-jpeg-rcc-support` — CHARX JPEG-hybrid + RCC-encrypted
- [ ] (feature) `TASK-auto-translation-layer`, `TASK-tts-voice-narration`,
      `TASK-adaptive-audio`, `TASK-plugin-extension-api` — from ideas gap summary

## Sources

- SillyTavern: https://docs.sillytavern.app/extensions/ , /chatfilemanagement/ ,
  /worldinfo/ , /groupchats/ , /expression-images/ , /dynamic-audio/ , /tts/ , /translation/
- RisuAI: https://github.com/kwaroran/RisuAI ,
  https://deepwiki.com/kwaroran/Risuai/4.1.1-character-import-and-export ,
  https://deepwiki.com/kwaroran/Risuai/5.2.3-regex-scripts-and-processing ,
  https://github.com/character-foundry/character-foundry/blob/master/docs/charx.md
- Agnai: https://github.com/agnaistic/agnai · Chub: https://docs.chub.ai/docs ·
  NovelAI: https://github.com/NovelAI/nai-character-card-spec-v2
- Open WebUI: https://docs.openwebui.com/features/ · KoboldCpp: https://github.com/LostRuins/koboldcpp/wiki
