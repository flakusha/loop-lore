<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
- Add slots: `src/chat/context-window.ts`, `src/chat/token-counter.ts`
- Memory tiers/lossy selection: `src/memory/provision.ts`, `src/memory/budget.ts`
- Token estimate: `src/chat/token-utils.ts`, `src/generation/context-window-config.ts`

## Key Feature

| Feature                   | ID           | Effort | Description                                                                                                                |
| ------------------------- | ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Lossless/lossy tier model | FEA-ctx-tier | High   | Per-section losslessness contract: lossless tiers never summarized/truncated                                               |
| Consolidate dead system   | FEA-ctx-dead | Med    | Delete/merge PATH B (context-window.injectMemories/injectEvents, getChatContext consumers) + context-compressor/ dead code |
| Accurate token counting   | FEA-ctx-tok  | Med    | Replace char heuristic (×0.3 / ~4 chars-per-token) with real tokenizer (tiktoken)                                          |
| Compression metadata      | FEA-ctx-meta | Low    | Emit droppedTokens/compressedTokens/section-drops to telemetry per request                                                 |
| History compaction policy | FEA-ctx-sum  | Med    | Make summarize-vs-truncate configurable per mode; lossless window never summarized                                         |
| Tooling assessment        | FEA-ctx-tool | Low    | Document lean-ctx / tiktoken (rtk) applicability for chat context (research outcome below)                                 |

## Lossless / Lossy Contract (owner decision)

| Tier                   | Data                                                                                                                                                                                                 | Policy                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lossless**           | system, persona/actorHeader, NSFW gate, authorNote, GM notes, pinned examples, **recent chat history** (lossless window, `keepLast`), **current location + world/location state**, dynamic date/time | Always verbatim. Excess in a lossless tier drops the **oldest** member only if the tier itself is allowed to shrink (recent chat → promote older to lossy summary); it must never be silently summarized. |
| **Lossy-by-selection** | memories, lore beyond actives, events beyond top-N, ambient                                                                                                                                          | Dropped/capped by importance/confidence/relevance + budget. Kept content verbatim but selection is lossy.                                                                                                 |
| **Lossy-by-summary**   | history older than the lossless window                                                                                                                                                               | ContextCompactor summarizes into one `[Conversation Summary]` system message.                                                                                                                             |

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

| Task                    | Title                                                                                                                                                                                                                               | Priority | Status      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-ctx-tier-model     | Add per-section `losslessness` flag to section specs; enforce lossless-last in budget/drop                                                                                                                                          | High     | Not Started |
| TASK-ctx-dead-code      | Delete PATH B — `service/context.ts` + `getChatContext` done 2026-08-14; `context-window.ts` + `token-counter.ts:81` + dead `injectMemories/injectEvents` + `context-compressor/` + `compactPromptHistory` removal pending (debug route repoint to PATH A) | High     | 🟡 Partial (context.ts + getChatContext deleted) |
| TASK-ctx-tiktoken       | Adopt `@dqbd/tiktoken` (WASM) tokenizer; per-model encodings; replace char heuristic. Keep pure fallback when model unknown                                                                                                         | High     | Not Started |
| TASK-ctx-metrics        | Emit compression metadata (original/compressed tokens, count, section drops, per-tier loss) to telemetry + `compress-metadata` on response                                                                                          | Med      | Not Started |
| TASK-ctx-summarize-cfg  | Configurable strategy (sliding/summarize/truncate) + lossless window size per mode; wire into build-prompt (stop hardcoding 0.85/keepLast)                                                                                          | Med      | Not Started |
| TASK-ctx-lore-budget    | Cap unbounded lore section with a token budget (currently never budgeted)                                                                                                                                                           | Med      | Not Started |
| TASK-ctx-token-accuracy | Golden tests: token estimates vs tiktoken ground truth; budget enforcement boundaries                                                                                                                                               | Med      | Not Started |
| TASK-ctx-leanctx-doc    | Research note codifying lean-ctx/tiktoken applicability (see Research)                                                                                                                                                              | Low      | Not Started |
| TASK-ctx-storemark      | § Write-up of story-front-end context-template precedent → guard spec (recent-verbatim + summary-card)                                                                                                                              | Low      | Not Started |
| TASK-ctx-summary-self   | Evaluate ACON-style guideline learning for lossy-by-summary tier (future; no import)                                                                                                                                                | Low      | Not Started |
| TASK-ctx-cache-note     | Telemetry note for provider prompt-caching (stable system prefix → cache hits)                                                                                                                                                      | Low      | Not Started |

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

## Tooling Landscape & Applicability (2026-08 research)

Sweep of net tooling across the three requested arenas, with a verdict for THIS repo
(Bun + TypeScript, Elysia, no external AI-services at runtime). Applicability is graded
**import** (usable as a runtime dep), **borrow** (not importable, but the technique
maps to our tier model), **pattern** (external service/reference design only).

### Arena 1 — Chat & story-based (RPG/character-AI)

The closest analog space is the RP/character front-end ecosystem (SillyTavern and kin).
Their context model is the canonical precedent for our lossless/lossy split:

- **Context Templates / Prompt Manager** (SillyTavern): user-defined ordered "macros"
  (character card, scenario, lorebook, world info, author's note, persona, chat history,
  summary) each assigned a slot + a fixed **context size** budget; the last N recent
  messages are always kept verbatim (lossless), older messages roll into a
  **summarized "chat metadata"/"summary card"** (lossy) inserted at a fixed position.
  Verdict: **borrow** — loop-lore already does this via `PROMPT_SECTIONS` +
  `ContextCompactor`; our gap is the _explicit lossless-vs-lossy guard_, which ST's
  "always keep recent verbatim" models directly.
- **Lorebooks / world info with activation + cooldown** (SillyTavern/Character.AI style):
  lossy-by-selection — our `loreSection`/`lorebook` already matches; leaves the unbounded
  (never token-budgeted) lore risk the epic flags.

### Arena 2 — Agentic (memory + context for long-horizon agents)

- **LLMLingua** (microsoft, 6.5k★, EMNLP'23/ACL'24): lossy prompt + KV-compression,
  up to 20× via perplexity-gated token pruning (LLMLingua-1/2, Selective Context).
  Verdict: **borrow only** — it is a **Python** library (`pip llmlingua`), cannot be a
  Bun/TS runtime dep; and perplexity research shows structured/code text compresses well
  but **prose/plots poorly** — directly relevant: our XML-tagged sections are good pruning
  targets, story prose is a bad one. Reimplementing its perplexity gate in TS is heavy
  and off-mission; the actionable takeaway is _never token-prune narrative prose_.
- **ACON** (microsoft/acon, MIT, arXiv 2510.00615): compresses agentic
  `History → Reasoning + Refined Observation` per step, and **learns compression
  guidelines** by diffing full-vs-compressed trajectories. Verdict: **pattern** —
  validates our lossy-by-summary tier and suggests a self-improving summarizer; the
  observation-compression loop maps to a future "compress world-state observation"
  feature, not something to import.
- **Agent memory frameworks — Mem0, Zep, Letta/MemGPT, A-MEM, MemPalace, DPM**:
  external services/architectures (temporal knowledge graphs, hierarchical memory,
  stateless projection memory that matches summarization quality with retrieval
  latency). Verdict: **pattern only** — each is a heavyweight external service or
  Python server; none is an embeddable Bun lib, and loop-lore already owns
  `epic-memory-knowledge-systems` (three-tier) + `epic-memory-propagation`. Their
  _hierarchical-then-retrieval_ memory shape is the model for making our lossy memory
  tier smarter than raw importance-sort.

### Arena 3 — General / LLM-side (for completeness)

- **Token counting (lossless budget):** `@dqbd/tiktoken` (WASM, Bun-compatible,
  cl100k/o200k/various + BPE) — the concrete import for accurate counting. Also
  `gpt-tokenizer` (pure TS, offline). Verdict: **import** (primary win).
- **FlashCompact taxonomy** (morphllm) classifies compaction as: verbatim (lossless),
  LLM summarization, opaque/latent, LLMLingua token-pruning. **Awesome-Context-Compression-LLMs**
  taxonomizes explicit (input) / implicit (latent: PCC, CLaRa 32-64× memory-slot
  autoencoders) / inference-time KV compression. Verdict: **pattern** — latent/opaque
  compression is experimental and provider-dependent; skip for v1, note as future.
- **Prompt caching** (Anthropic cache_control / OpenAI auto / Vertex): KV-level cost
  optimization, orthogonal to our token-budget work but worth a telemetry note
  (stable system-prompt prefix → cache hits).

## Feature Proposal: Output Styling Parameters (Chat Settings → Context Construction)

**Status:** 📝 Proposed
**Type:** Feature — chat-settings extension, bound to prompt assembly
**Owner:** TBD
**Depends on:** `resolveResponseLength` wiring gap; `epic-config-extensions.md` (ECE for custom genres); `epic-frontend-settings.md` (UI)

### Problem
Chat settings today expose *length* (`responseLengthPreset`/`responseLengthCustom`) and
GM/LLM knobs (`gm_config`), but no first-class **writing-style** control. A user cannot
declare a genre/register ("high fantasy", "sci-fi", "modern noir") that is resolved and
injected into the LLM context. The SillyTavern-derived seams that *could* carry style
(`mes_example`, `post_history_instructions`) are character-level and free-form — there is no
chat/user/server-scoped selector. Worse, `resolveResponseLength` (`src/chat/response-length.ts`)
is defined + exported but **never wired into generation**, so even length is not yet bound to
context construction.

### Clarification — length vs. style are orthogonal
The example list "short, high fantasy, sci-fi, modern" mixes two axes. `short` is a *length*
concern already owned by `responseLength` (short/medium/long/custom). **Output Styling = genre /
register / tone**, orthogonal to length, so the two compose (e.g. `long` + `cyberpunk`). The new
parameter must not re-encode length.

### Design
One new chat-level setting, resolved via the existing **chat → user → server** fallback chain:
- `chats.output_style_preset` (text, nullable) — chat override (DB column, mirrors `response_length_preset`).
- `chats.gm_config.outputStyle` (JSON, optional) — richer shape `{ preset, customInstruction?, intensity? }` for per-chat tuning.
- `users.settings.outputStyle` — user-global default (mirrors `resolveResponseLength`'s `userPreset` arg).
- `config.yaml` → new `generation.chatDefaults.outputStyle` (server default).

Resolver `resolveOutputStyle(chatPreset, userPreset, serverDefault)` (mirror `src/chat/response-length.ts`)
→ `OutputStyleConfig { preset, customInstruction?, intensity }`.

### Binding to context construction (the key constraint)
Inject via a **new prompt section** so it lives in the assembled system context, not ad-hoc:
- Add `styleSection` to `PROMPT_SECTIONS` in `src/assistant/prompt/registry.ts`, ordered immediately
  after `systemSection` / adjacent to `authorNoteSection` (high precedence, early system context).
- `styleSection.build(ctx)` reads the resolved `OutputStyleConfig` and emits a single `system` message:
  a curated style directive + an optional few-shot example (reuse the `<START>`-parse logic from `examples.ts`).
- Guard: `styleSection.enabled(ctx)` MUST return false unless a style is resolved (no `outputStyle` configured → emit nothing). This keeps existing assembly tests (`src/assistant/prompt-assembler.test.ts` et al.) and prompt hashes unaffected when no style is set — mirrors `authorNoteSection` gating on `post_history_instructions`.
- Wire `resolveOutputStyle` into `PromptAssembler.assemble()` — extend the `chats` select (currently `prompt-assembler.ts:56`, which omits both) to include `output_style_preset` **and** `gm_config`, then read `output_style_preset` / `gm_config.outputStyle`, merge with `users.settings`, fall back to `config`.
- XML-wrap the directive via `wrapSection("output_style", …)` (reuse `src/assistant/xml-utils.ts`) for prompt-injection safety.
- **Also wire `resolveResponseLength`** in the same pass — same seam, closes the current dead-code gap.

### Inspirational references (repo)
- `src/assistant/prompt/sections/examples.ts` — `mes_example` few-shot style demonstration (SillyTavern pattern).
- `src/assistant/prompt/sections/author-note.ts` + `post-history.ts` — `post_history_instructions` as a persistent tone directive, XML-wrapped.
- `src/assistant/prompt/sections/system.ts` — system-prompt precedence (override > fallback > actor).
- `src/chat/response-length.ts` — the resolver/fallback pattern to mirror.

### Inspirational references (external research)
- **NovelAI Preamble** — style tags `[ Style : chat, detailed, sensory ]` inserted above the chat to steer writing style (docs.sillytavern.app/usage/api-connections/novelai).
- **Tavern Studio Presets** — *global preset* + *chat-level preset override* (tavernstudio.com/docs/en/preset-basics) — maps 1:1 to our chat→user→server chain.
- **sillytavern-preset-creator** — custom presets add formatting/HTML/CYOA features.
- **RPG tools** (LoreKeeper, Vellum, Infitale, roleplaywritingstyles.com) — genre + tone as *fundamental* generation parameters ("define genre (high fantasy, sci-fi, horror), tone").

### Extensions (from web research)
- **Extensible genre enum** — ship built-in presets (`neutral`, `high_fantasy`, `sci_fi`, `modern`, `noir`, `cyberpunk`, `pulp`, `literary`, `horror`, `western`) now; custom-genre extension via the **ECE primitive** is *contingent* — `epic-config-extensions.md` is 📝 Draft and the ECE primitive is unimplemented (semantic sweep: 0), so custom genres block on that epic landing first (built-in ∪ extensions, precompiled, once ECE exists).
- **Per-actor style override** — like `actorModels`, allow per-speaker style in multi-LLM story mode.
- **Curated few-shot examples** — one exemplar passage per built-in genre, injected via the `examples` machinery; `customInstruction` for bespoke voices.

### Proposed tickets
- `FEAT-chat-output-styling` — config schema + `resolveOutputStyle` + `styleSection` binding + wire `resolveResponseLength`.
- `FEAT-chat-output-styling-ui` — chat-settings modal control (depends on `epic-frontend-settings.md`).
- `FEAT-chat-output-styling-extensible` — custom genres via ECE (depends on `epic-config-extensions.md`).

## Research / References

- **lean-ctx applicability — NOT a runtime dependency.** lean-ctx (this harness's context tool)
  compresses _coding-agent_ tool output (read/grep/shell) via selective context + token-efficient
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
- Tooling landscape sources (2026-08):
  - LLMLingua (Python, 20×, token-pruning): https://github.com/microsoft/LLMLingua
  - ACON (agentic observation compression + learned guidelines, MIT): https://github.com/microsoft/acon · arXiv:2510.00615
  - Awesome-Context-Compression-LLMs (explicit/implicit/KV taxonomy): https://github.com/broalantaps/Awesome-Context-Compression-LLMs
  - FlashCompact (compaction taxonomy: verbatim/summarize/opaque/pruning): https://www.morphllm.com/flashcompact
  - tiktoken (WASM, Bun-ok): `@dqbd/tiktoken` · gpt-tokenizer (pure TS)
  - Agent memory frameworks (pattern refs): Mem0, Zep, Letta/MemGPT, A-MEM, MemPalace, DPM (stateless projection memory)

## Related Epics

- **epic-memory-knowledge-systems.md** — owns memory tiers, budget, extraction, injection, decay (the lossy memory archetype).
- **epic-memory-propagation.md** — cross-timeline/chat memory scoping (feeds the lossy memory tier).
- **epic-analytics-observability.md** — telemetry sink for compression metadata.
- **epic-testing-qa.md** — golden token-accuracy + budget-boundary tests live in the QA epic's task pool.

## Chat Audit 2026-08-25 — Related Findings

- **B3:** Token counter uses generic `defaultTokenCount` (no per-model map) in `src/chat/token-counter.ts` → inaccurate budgeting. See TASK-ctx-token-accuracy.

_Source: chat functionality audit (loop-lore), 2026-08-25._
