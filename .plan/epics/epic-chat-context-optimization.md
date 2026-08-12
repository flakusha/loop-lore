# Epic: Chat Context Optimization

**Status:** 🟡 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** context, prompt, token-budget, compression, lossless, lossy, tiktoken

## Overview

Optimize how loop-lore assembles, budgets, and compresses the LLM context window.
The core design principle (owner decision): **explicit lossless/lossy tiering.**
Lossless tiers (recent chat, location, world events, system/persona, GM notes) must
**never** be summarized or truncated. Lossy tiers (memories, lore beyond relevance,
history beyond `keepLast`) may be selected, capped, or summarized — with every loss
measured and surfaced as compression metadata.

Today the pipeline has no such contract: two parallel context systems exist, dead
compression code ships, and token accounting uses a char heuristic everywhere.

## Reference

- Assembly pipeline: `src/assistant/prompt-assembler.ts`, `src/assistant/prompt/registry.ts`
- Budget orchestration: `src/generation/generate-route/build-prompt.ts`, `handler.ts`
- Compaction: `src/generation/context-compactor.ts` (wired), `src/generation/context-compressor/` (dead)
- Add slots: `src/chat/context-window.ts`, `src/chat/service/context.ts`, `src/chat/token-counter.ts`
- Memory tiers/lossy selection: `src/memory/provision.ts`, `src/memory/budget.ts`
- Token estimate: `src/chat/token-utils.ts`, `src/generation/context-window-config.ts`

## Key Feature

| Feature                 | ID           | Effort | Description                                                                 |
| ----------------------- | ------------ | ------ | --------------------------------------------------------------------------- |
| Lossless/lossy tier model | FEA-ctx-tier | High   | Per-section losslessness contract: lossless tiers never summarized/truncated |
| Consolidate dead system   | FEA-ctx-dead | Med    | Delete/merge PATH B (context-window.injectMemories/injectEvents, getChatContext consumers) + context-compressor/ dead code |
| Accurate token counting   | FEA-ctx-tok  | Med    | Replace char heuristic (×0.3 / ~4 chars-per-token) with real tokenizer (tiktoken) |
| Compression metadata      | FEA-ctx-meta | Low    | Emit droppedTokens/compressedTokens/section-drops to telemetry per request |
| History compaction policy | FEA-ctx-sum  | Med    | Make summarize-vs-truncate configurable per mode; lossless window never summarized |
| Tooling assessment        | FEA-ctx-tool | Low    | Document lean-ctx / tiktoken (rtk) applicability for chat context (research outcome below) |

## Lossless / Lossy Contract (owner decision)

| Tier | Data | Policy |
| ---- | ---- | ------ |
| **Lossless** | system, persona/actorHeader, NSFW gate, authorNote, GM notes, pinned examples, **recent chat history** (lossless window, `keepLast`), **current location + world/location state**, dynamic date/time | Always verbatim. Excess in a lossless tier drops the **oldest** member only if the tier itself is allowed to shrink (recent chat → promote older to lossy summary); it must never be silently summarized. |
| **Lossy-by-selection** | memories, lore beyond actives, events beyond top-N, ambient | Dropped/capped by importance/confidence/relevance + budget. Kept content verbatim but selection is lossy. |
| **Lossy-by-summary** | history older than the lossless window | ContextCompactor summarizes into one `[Conversation Summary]` system message. |

Rule: a lossless-tier section is never listed in the priority-drop path while a
lossy tier above it has remaining slack; lossless is dropped **last**, lossy is
dropped **first**.

## Analysis & Current State (2026-08, verified against source)

**Two parallel context systems exist.**

- **PATH A — real generation pipeline.** `POST /api/generation/generate` →
  `buildPrompt` (`src/generation/generate-route/build-prompt.ts:26`) →
  `PromptAssembler.assemble` (`src/assistant/prompt-assembler.ts:31`) runs **19
  ordered section builders** from `PROMPT_SECTIONS` (`src/assistant/prompt/registry.ts:26-44`),
  each returning `GenerationMessage[]`. If `totalTokens > tokenBudget`, low-priority
  sections are **dropped whole** by `PRIORITY` rank (`prompt-assembler.ts:100-121`).
  Then `ContextCompactor.compact` summarizes the older half of history when
  `tokenCount > 0.85 * budget` (`build-prompt.ts:48-61`; class `src/generation/context-compactor.ts:48`).
- **PATH B — parallel, mostly dead.** `src/chat/context-window.ts` sliding-window
  `computeContextWindow` + `injectMemories`/`injectEvents`. **`injectMemories`/`injectEvents`
  have ZERO production callers**; `getChatContext` has no consumers outside `src/chat`
  exports; the only prod user is the debug read route `routes/chat-context/handlers.ts:95`.
  A second `computeContextWindow` lives at `src/chat/token-counter.ts:81` (different signature,
  test-only). This layer never feeds the LLM.

**Dead compression code:**
- `src/generation/context-compressor/` (`compressMessages`) is referenced **only by its own test** — not wired.
- `compactPromptHistory` export (`prompt-assembler.ts:183`) has **no callers**.
- `context-window-config.ts` `DEFAULT_CONTEXT_WINDOW` + `compressMessages` are unused by the real
  pipeline; the pipeline uses hardcoded `ContextCompactor` defaults (threshold 0.85, keepLast 10) in `build-prompt.ts`.

**Token accounting is heuristic:** `estimateTokens` = chars × 0.3 (`context-compactor.ts:16`) /
~4 chars-per-token (`context-window-config.ts:57`) everywhere, with no provider- or model-specific
accuracy. Over/under-estimation causes premature whole-section drops (loss) or budget blowouts.

**Per-section current behavior (grounded):**
- chat-history: **verbatim**, decrypted, limit `floor(tokenBudget/4)` msgs (`chat-history.ts:13-51`) — already lossless.
- story-context (location + location_states time/weather/atmosphere): verbatim, story-mode only (`story-context.ts:12-42`).
- memories: lossy-by-selection — provision (scope/privacy/shareability/trust) + injection
  (probability/comfort/relevance) filters, **1024-token budget** (`memories.ts:104-231`). `PRIORITY.memories=3` (high drop risk).
- events: world_states ≤3 + location_states + 1 ambient, **top 5** by importance (`events.ts:105-131`). Lossy by cap.
- lore: audience/cooldown/keyword gated, verbatim, **never token-budgeted** (`lore.ts:92-201`) — unbounded risk.
- dynamic-context (date/time): verbatim, tiny.
- recentEvents: `NotificationService.buildRecentEventsContext`.

## Candidate Tasks

| Task                  | Title                                                                                     | Priority | Status      |
| --------------------- | ----------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-ctx-tier-model   | Add per-section `losslessness` flag to section specs; enforce lossless-last in budget/drop | High     | Not Started |
| TASK-ctx-dead-code    | Delete PATH B (`src/chat/context-window.ts`, `service/context.ts`, `token-counter.ts:81`, dead `injectMemories/injectEvents`, `getChatContext`) or repoint debug route to PATH A; remove context-compressor/ + compactPromptHistory | High | Not Started |
| TASK-ctx-tiktoken     | Adopt `@dqbd/tiktoken` (WASM) tokenizer; per-model encodings; replace char heuristic. Keep pure fallback when model unknown | High | Not Started |
| TASK-ctx-metrics      | Emit compression metadata (original/compressed tokens, count, section drops, per-tier loss) to telemetry + `compress-metadata` on response | Med | Not Started |
| TASK-ctx-summarize-cfg| Configurable strategy (sliding/summarize/truncate) + lossless window size per mode; wire into build-prompt (stop hardcoding 0.85/keepLast) | Med | Not Started |
| TASK-ctx-lore-budget  | Cap unbounded lore section with a token budget (currently never budgeted)                  | Med     | Not Started |
| TASK-ctx-token-accuracy| Golden tests: token estimates vs tiktoken ground truth; budget enforcement boundaries    | Med     | Not Started |
| TASK-ctx-leanctx-doc  | Research note codifying lean-ctx/tiktoken applicability (see Research)                     | Low     | Not Started |

## Open Questions

1. Tokenizer scope: tiktoken covers OpenAI + several OSS encodings, but not all providers
   (Anthropic cl100k≠own, Gemini). Use tiktoken approximations with per-provider encoder mapping,
   or accept per-model config? (Recommend tiktoken + config override.)
2. Should lossless chat history promote to lossy summary automatically when the lossless window
   exceeds budget, or should budget prefer dropping lower-priority lossless sections first? (Owner leans: recent chat + location/world always wins.)
3. Consolidate PATH B by **deleting** it, or keep a slim read-only version for the debug route?
   Recommend: keep only the debug route's needed state, backed by PATH A's assembler.
4. Dead `context-compressor/` — delete entirely, or migrate its strategy enum into ContextCompactor?
   Recommend: fold `strategy` option into `ContextCompactor`, delete the dead package.

## Research / References

- **lean-ctx applicability — NOT a runtime dependency.** lean-ctx (this harness's context tool)
  compresses *coding-agent* tool output (read/grep/shell) via selective context + token-efficient
  compression; it targets developer workflows, not product LLM prompts, and lives in the harness,
  not the repo. **Borrow its strategies** (selective pruning, compression-ratio metadata, charset
  heuristics for fast estimation) but do not import it into `loop-lore` runtime. See
  `/home/flak/.codex/LEAN-CTX.md` for its model.
- **rtk / tiktoken applicability — YES (lossless token counting).** `@dqbd/tiktoken` (WASM, Bun-compatible)
  gives exact `cl100k`/`o200k` counts, replacing char heuristics → precise budget enforcement so
  lossless tiers aren't dropped unnecessarily. This is the primary concrete win from the tooling question.
- **State of the art — compression methods** (FlashCompact taxonomy): verbatim compaction (lossless),
  LLM summarization, opaque/latent compression, LLMLingua-1/2 + Selective Context token-pruning (lossy),
  observation condensation. Novel: Latent Context Compilation (distill long context);
  DPM/Projection Memory (stateless, retrieval-like memory matching summarization quality).
- Perplexity finding: code/token-pruning compress better than math/logic — relevant when an RPG prompt
  contains structured (XML-tagged) sections; structured sections are good pruning targets, prose/plots are poor.
- Current repo heuristics: `src/chat/token-utils.ts`, `context-window-config.ts:57`, `context-compactor.ts:16`.

## Related Epics

- **epic-memory-knowledge-systems.md** — owns memory tiers, budget, extraction, injection, decay (the lossy memory archetype).
- **epic-memory-propagation.md** — cross-timeline/chat memory scoping (feeds the lossy memory tier).
- **epic-analytics-observability.md** — telemetry sink for compression metadata.
- **epic-testing-qa.md** — golden token-accuracy + budget-boundary tests live in the QA epic's task pool.
