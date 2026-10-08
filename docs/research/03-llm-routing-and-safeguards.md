# 03 — LLM Routing and Safeguards: What Exists, What Is Missing

Research doc for the harness worktree. **No source changes were made.** Every claim
below carries a `file:line` citation from the dev checkout at
`/home/flak/git-ai/loop-lore`. Anything I did not read directly is marked
`[UNVERIFIED]`; the "Method and coverage" section at the end lists what I did *not*
open, so absence claims are scoped honestly.

> **Verification:** see [`05-claim-verification.md`](./05-claim-verification.md) — claim set independently verified (12 confirmed / 4 partial / 1 refuted); corrections are applied inline below.

Five concerns: (1) in-flight LLM rerouting to CLI/MCP, (2) context retain/drop,
(3) TTS + context injection, (4) loop + hallucination protection, (5) external
service API integration.

---

## 1. In-flight LLM call rerouting to CLI and MCP tooling

### (a) Exists today

**There is a real provider abstraction — the call is not inline.** The contract is
`LLMProvider` in `src/generation/providers/types.ts:227-249`:

```ts
export interface LLMProvider {
  readonly capabilities: ProviderCapabilities;
  complete(req: GenerateRequest): Promise<GenerateResponse>;        // :231
  stream(req: GenerateRequest, handler: StreamHandler): Promise<GenerateResponse>; // :234
  healthCheck(): Promise<{ status: "ok" | "degraded" | "down"; ... }>;         // :237
  listModels(): Promise<ModelInfo[]>;                                          // :245
  embed?(input: string | string[]): Promise<number[][]>;                       // :248
}
```

`GenerateRequest` (`types.ts:68-115`) carries `model`, `messages`, `apiKey?`,
`tools?`, a free-form `params` bag (`:78-105`), `signal?: AbortSignal` (`:107`),
and `harness?: HarnessCallContext` (`:114`).

**A shared base class implements the interface** so concrete providers only supply
dispatchers: `abstract class BaseProvider<S> implements LLMProvider` at
`src/generation/providers/base.ts:92`; the state shape is `BaseProviderState`
(`base.ts:32-39`) and the delegation bindings are `BaseProviderDispatchers`
(`base.ts:45-56`). `[UNVERIFIED]` I read only the declaration ranges of `base.ts`;
the class body (`:92-180`) was elided in my read.

**Registry + resolution order exist.** `registerProvider` / `getProvider` /
`unregisterProvider` / `listProviders` at `src/generation/providers/registry.ts:35-71`,
`resolveProvider(opts)` at `registry.ts:110` (signature confirmed, body elided),
`buildFailoverList(primaryName, config?, signal?)` at `registry.ts:189`,
`initializeProviders(config)` at `registry.ts:251`.

**Failover + circuit breaking are centralized.** `callWithFailover(providers, req,
handler?)` at `src/generation/providers/call-with-failover.ts:35-39`; it records one
exec-log line per call via `logRun` (`:47-77`), iterates the ordered list at `:79-114`,
and throws `All providers failed: …` at `:116-121`. `CircuitBreaker` at
`src/generation/providers/circuit-breaker.ts:44` with closed/open/half-open states
(`:13`), per-provider configs (`:64`), `allowRequest` (`:93`), `onSuccess` (`:109`),
`onFailure(providerName, retryAfterMs?)` (`:139`), defaults threshold 3 / 10s base /
300s max cooldown (`:36-41`), singleton export `circuitBreaker` (`:191`).

**Streaming and abort/cancellation DO exist — this is not a gap.**

- Chunk protocol: `ChunkEvent` with `type: "content" | "thinking" | "tool_call" | "done" | "error"` at `types.ts:131-137`; `StreamHandler = (chunk: ChunkEvent) => void` at `types.ts:140`.
- Per-chunk policy checks: `processStreamingChunk({attemptId, chunk, db})` at `src/generation/cancellation-actions/streaming.ts:37-41`, returning `ChunkAction` (`:17-20`).
- Abort wiring: `active.abortController.signal.aborted` checked per chunk at `streaming.ts:46`; chunks counted at `:50-51`; `onChunk` fan-out at `:71`.
- Signal composition and timeouts at the HTTP edge: `combineAbortSignals(...)` at `src/generation/providers/openai-compatible/http.ts:138-156`; `fetchRaw(state, url, body?, signal?, apiKeyOverride?)` creates a controller, combines the caller signal, and `setTimeout(() => controller.abort(), state.timeout)` at `http.ts:166-197` (timeout timer `:176-178`, `clearTimeout` in `finally` `:194-196`).
- Cancellation side-effect registry: `registerSideEffectJob(attemptId, job)` at `src/generation/cancellation-actions/side-effects.ts:33`, job kind `"tts" | "image-queue" | "other"` at `src/generation/cancellation-tracker/types.ts:21`.

**Dispatch sites funnel through a scheduler + failover seam**, not the provider directly:
`scheduledCallWithFailover(opts)` at `src/generation/scheduler.ts:71`,
`dispatchThroughScheduler(deps, opts)` at `scheduler.ts:168`. The aux path is the
clearest example: `callAux(...)` submits a Low-priority slot whose `run` calls
`callWithFailover(failover, {model, messages, apiKey, params})` at
`src/aux-pipeline/runner.ts:176-190`, then races it against `withTimeout(handle.result,
timeoutMs)` at `runner.ts:192`.

**Some assistant commands bypass failover entirely** and call the provider directly:
`resolved.provider.complete(req)` at `src/assistant/commands/create.ts:257`,
`regen.ts:100`, `rewrite.ts:193`, `summarize.ts:147`, `translate.ts:153` and `:171`,
`src/chat/auto-translate.ts:158`, `src/generation/caption-route.ts:167`,
`src/generation/auto-gen/story-mode.ts:89`, `src/routes/generation/compare.ts:177`,
`src/routes/story-orchestration/helpers.ts:132`, `src/routes/vn-generate/choices.ts:96`,
`src/routes/vn-generate/story.ts:89`.

**An in-process tool surface already exists**, which is the shape an MCP executor
would have to join: `executeToolCalls(toolCalls, ctx?)` at
`src/generation/generate-route/tool-execution.ts:155`, bounded by
`MAX_TOOL_ROUNDS = 5` (`:48`), with `sanitizeToolOutput` (`:67`) and
`gatePluginToolsByRole(agentRole)` (`:87`).

**Subprocess spawning exists, but not in any generation path.** The only production
spawn sites I found are server lifecycle managers: `spawn({cmd: args, ...})` for
`llama-server` at `src/services/server-external-manager/start-llama.ts:143`,
`llama-swap` at `start-llama.ts:186`, and `sd-server` at
`src/services/server-external-manager/start-sd.ts:145`; plus
`src/config/cert.ts:54` (`Bun.spawnSync(["openssl", ...])`) and
`src/harness/run-context.ts:29-33` (`execFileSync("git", args)`). Every spawn is a
**long-lived local server that is then reached over HTTP**, not a one-shot executor.
All other `Bun.spawn` / `execSync` hits were in `*.test.ts` or `src/scripts/`.

**MCP: not present.** A case-insensitive grep for `\bmcp\b|model.context.protocol`
across `src/` returned **no matches**. There is no MCP client, config surface, or
transport in the tree. `[UNVERIFIED]` I did not grep `docs/`, `.plan/`, or
`plugins/` for MCP — only `src/`.

**Model routing (which provider) exists but is not a pure no-op.**
`ModelRouter` at `src/generation/routing/router.ts:58` (not 57), strategies
`ROUTING_STRATEGIES` at `router.ts:46`, and the explicit guard
`routingReorders(config)` at `router.ts:129-133` which returns `false` only when config
is absent or fully default. With any non-empty `rules[]`, it flips on. The default
`capability-match` strategy *preserves order* but still drops candidates via the
`requiresCapabilities` filter (`router.ts:81-88`) and bails on an empty set (`:90`).
`sharedRouter(routing?)` at `router.ts:143`. So there is a policy seam; `routingReorders`
is not a pure no-op even at default settings because capability filtering is active.

### (b) Explicit gap

**There is no executor-agnostic egress seam.** Every `LLMProvider` implementation is
an HTTP client — the concrete families are all `BaseProvider` subclasses whose
dispatchers build a `fetch` to `${state.baseUrl}/...`
(`openai-compatible/http.ts:92` `buildBody`, `:166` `fetchRaw`;
`src/generation/providers/anthropic/stream.ts:46`;
`src/generation/providers/ollama-native/core.ts:92`). Nothing in the interface
distinguishes "provider" from "executor", so a CLI or MCP backend would have to
impersonate an HTTP provider.

**Nothing can hand a partially-consumed request to a different executor.**
`callWithFailover` (`call-with-failover.ts:79-114`) only advances to the next
candidate when a provider *throws*. Once chunks have been delivered to the client
through `streamToClient`, a reroute would either duplicate already-emitted content or
drop it. There is no notion of "checkpoint the prompt, switch executor, replay the
not-yet-emitted suffix", and no place that records how much of a stream was consumed
mid-flight.

**No MCP transport exists at all** (grep above), so the "MCP tool" executor would be
net-new: a client, a tool-name → handler registry, and a config surface.

**The direct-`complete()` call sites bypass the scheduler, failover, circuit breaker,
and exec-log** entirely (`assistant/commands/*.ts` above), so even a routing change
made at `callWithFailover` would not reach them.

### (c) Smallest viable next step

Insert one indirection at the exact seam that already exists and is already used by
the majority of dispatch — the failover list. Concretely:

1. Add an `LLMProvider` implementation whose dispatch shells out with `Bun.spawn`,
and return it ahead of the HTTP providers from `buildFailoverList(primaryName, config?, signal?)` (`registry.ts:189`) as `{ name: "cli:…", provider: <adapter> }`. Zero signature changes; `callWithFailover` (`call-with-failover.ts:35`) picks it up for free. Reuse the `spawn({cmd, stdout, stderr})` shape already proven at `start-llama.ts:143`.
2. For mid-flight handover, the minimal honest version is *fail-before-first-chunk* rerouting only: hook the failover loop's error branch (`call-with-failover.ts:79-114`) and gate on the tracker already counting chunks (`cancellation-actions/streaming.ts:50`). Reroute only before the first `content` chunk; otherwise fail. This needs one boolean on the active-generation record and no new plumbing.
3. MCP comes after: an `LLMProvider` whose `complete` speaks MCP. There is no client to reuse, so this is a new dependency, not a refactor.

---

## 2. Context retain / drop

### (a) Exists today

**Four independent, unconnected retention mechanisms exist.** They do not share a
type and do not know about each other.

**(i) Section-level priority dropping in the prompt assembler.**
`dropOverBudgetSections(sections, tokenBudget, totalTokens, priorityOf)` at
`src/assistant/prompt-budget.ts:62-91`; `priorityOf` defaults to
`PRIORITY[name] ?? 0` (`:70`), with the comment that unknown names must stay immune
from dropping. This is the only place with an explicit *importance* ordering.

**(ii) Conversation summarization.** `ContextCompactor` at
`src/generation/context-compactor.ts:57`; `Summarizer = (segments: string[]) =>
Promise<string> | string` at `:36`; the injected summary is a **system** message
prefixed `[Conversation Summary]` (`:48-49`); the no-LLM fallback is
`extractiveSummarize(segments)` at `:119-127`. Entry point
`compactPromptHistory(messages, tokenBudget)` at `prompt-budget.ts:27`.

**(iii) Positional token compression.** `compressMessages({messages, config,
tokenCountFn})` at `src/generation/context-compressor/compress.ts:20`, driven by
`ContextWindowConfig` at `src/generation/context-window-config.ts:24-35`
(`maxContextTokens`, `minRecentMessages`, `strategy: "sliding" | "summarize" |
"truncate"`, `compressionThreshold`, `minTurnsAfterCompression`), defaults at `:53-59`
(32 000 tokens, keep 8 recent, sliding, 0.75 threshold). Token counting is a char
heuristic `Math.ceil(text.length / 4)` at `context-window-config.ts:66-68`.
`[UNVERIFIED]` I did not open `context-compressor/strategies.ts` or `compress.ts`
beyond its signature, so the exact drop order per strategy is not confirmed here.

**(iv) Score-based message pruning.** `scoreMessage(msg)` at
`src/chat/pruning/score.ts:30-87` computes a weighted sum (`:65-70`) and **two**
separate scores: `relevanceScore` and `importanceScore` (`:73-76`), setting
`shouldPromote: importanceScore >= 0.6` (`:83`) and leaving `shouldPrune: false` to be
set downstream (`:84`). `pruneMessages(messages, config)` at
`src/chat/pruning/prune.ts:91-130`, described at `prune.ts:9-16` as score → sort
ascending → remove lowest until under budget → promote high-importance to memory →
insert a system message noting what was pruned. Wired at
`src/generation/auto-gen/context-pruning.ts:27-106`, which triggers only when
`getThresholdState(...)` returns `critical` or `imminent` (`context-pruning.ts:48-52`)
against a hardcoded `MAX_TOKENS = 32_000` (`:18`).

**(v) Context window *reporting* (no eviction).** `computeContextWindow(messages,
maxTokens, options)` at `src/chat/context-window.ts:52`, `getThresholdState(usage,
thresholds)` at `:145`, `injectMemories(context, memories)` at `:163`,
`injectEvents(context, events)` at `:197`, `DEFAULT_MIN_RECENT = 8` at `:32`. These
build a `ContextWindow` view; nothing here drops messages.

**Per-model budgets are known.** `context_window` / `max_output` columns and
`getContextWindowForModel` are used by the assembler
(`src/assistant/prompt-assembler.ts:13`), with per-model override plumbing in
`src/admin/model-capabilities-overrides.ts:29-56`.

### (b) Explicit gap

**No "important vs discardable" notion reaches the actual prompt.** The one real
importance signal, `importanceScore` / `shouldPromote` in `pruning/score.ts:73-83`,
is consumed **only** by `checkAndPruneContext`
(`auto-gen/context-pruning.ts:68`) — a post-hoc DB-message prune on a separate
trigger. The path that builds the prompt (`generate-route/build-prompt.ts:61-114` →
`PromptAssembler` `src/assistant/prompt-assembler.ts:46`) drops sections by **static
name priority** (`prompt-budget.ts:70`), never by content importance. So in practice
eviction is positional (recent-kept, oldest-dropped) plus static-priority.

**Retention is decided in four places with four incompatible shapes**:
`PromptSectionReport` (assembler), `ScorableMessage`/`MessageScore` (pruning),
`ContextMessage` (compressor), `GenerationMessage` (the provider wire type,
`types.ts:72`). A single "what do we keep" decision would have to be written five
times.

**Token counting uses duplicated character heuristics** — not two sites but seven:
`length*0.3` at `context-compactor.ts:23-25` *and* `src/chat/pruning/prune.ts:31,40,121`;
`length/4` at `context-window-config.ts:66-68` *and* `src/chat/token-utils.ts:12,25`,
`src/frontend/alpine/memory-panel/transform.ts:23`, `src/frontend/pages/new-chat/helpers.ts:10`.

**The assembly→provider seam is clean and is the right lever.** `buildPrompt(...)`
returns `{ messages, systemPrompt }` (`build-prompt.ts:61`) and the caller then
builds a `GenerateRequest` (handler pipeline described at `handler.ts:6-8`). Messages
are a plain array handed to the provider (`types.ts:72`). Anything dropped or kept
here is invisible to the provider.

### (c) Smallest viable next step

Do not add a fifth mechanism. Move (iv)'s score into (i):

1. Give `PromptSectionReport` (`src/assistant/prompt/types.ts` — `[UNVERIFIED]`, I read only the import at `prompt-assembler.ts:34-40`) an optional `importance` field populated from the section's rendered token count plus a static weight.
2. Change `priorityOf` in `dropOverBudgetSections` (`prompt-budget.ts:62-91`) from `PRIORITY[name] ?? 0` to `(name) => PRIORITY[name] ?? computedImportance(name)`. The function's contract (sort, drop, report) is unchanged, so its tests stay valid.
3. Align the two token heuristics onto the one in `context-window-config.ts:66-68` — the assembler already imports `defaultTokenCount` from there (`prompt-assembler.ts:25`) — and delete `estimateTokens` at `context-compactor.ts:23`.

---

## 3. TTS and context injection

### (a) Exists today — TTS

**No TTS synthesis path exists.** A case-insensitive grep for
`tts|text-to-speech|textToSpeech|speechSynthesis|voice_id|elevenlabs` across `src/`
returned only:

- **Prompt templates for writing audio prompts**, not audio generation: `src/generation/audio-prompt-profiles.ts` with subtypes `"tts" | "sfx" | "music" | "voice-clone"` (`audio-prompt-profiles.ts:34`), per-family profiles for ElevenLabs / OpenAI-TTS / Piper / Bark / Stable-Audio / MusicGen / Riffusion (`audio-prompt-profiles.ts:107-114`), and `src/generation/audio-prompt-templates.ts`. That file's own header states it: *"Audio generation has no provider yet (FEAT-089/090/091 are future) — the per-modality apply route answers 501 until one lands."* (`audio-prompt-templates.ts:11-12`). `AUDIO_TEMPLATE_VARIABLES` at `:53-65` maps `lastMessage` to "last chat message content (cross-modality; TTS text)".
- **A cancellation hook with no producer.** `registerSideEffectJob(attemptId, job)` (`cancellation-actions/side-effects.ts:33`) with `kind: "tts"` on the job type (`cancellation-tracker/types.ts:21`) and a fan-out described at `cancellation-actions/cancel.ts:54-58`. Grep for `registerSideEffectJob(` found **only** `side-effects.ts` itself and `generate-route/__tests__/abort.test.ts:297-309` — i.e. no production code registers a TTS job.
- One incidental substring hit: the default character-card scenario text (`src/config/sections/characters/defaults.ts:192-196`), false positive on "whispering".

**Conclusion: TTS does not exist as a runtime capability, does not block any turn, and
has nothing to inject back into context.** The only TTS scaffolding is a
cancellation hook and a set of LLM prompt templates for *describing* audio.

### (a) Exists today — context injection

Injection is section-based and fully enumerated in
`src/assistant/prompt/registry.ts:40-83` — 30 `SectionBuilder`s in fixed order:
`systemSection` (`:41`), `styleSection` (`:42`), `taskClarificationSection` (`:43`),
`nsfwPolicySection` (`:44`), `authorNoteSection` (`:45`),
`customInstructionsSection` (`:46`), `actorHeaderSection` (`:47`),
`pluginAgentRoleSection` (`:48`), `groupParticipantsSection` (`:49`),
`groupTalkativitySection` (`:50`), `userPersonaSection` (`:51`),
`emotionAvatarSection` (`:52`), `outfitContextSection` (`:53`),
`internalTraitsSection` (`:54`), `actorGrowthSection` (`:55`), `loreSection` (`:56`),
`memorySection` (`:57`), `eventSection` (`:58`), `storyContextSection` (`:59`),
`travelSection` (`:60`), `gmNotesSection` (`:61`), `gameStateSection` (`:65`),
`turnSkipAbsenceSection` (`:70`), `dynamicContextSection` (`:71`),
`recentEventsSection` (`:72`), `interactionContextSection` (`:73`),
`examplesSection` (`:74`), `chatHistorySection` (`:75`), `postHistorySection` (`:82`).

Injection points by mechanism:

| Mechanism | Where |
|---|---|
| Admin/user system-prompt override | `resolveSystemPrompt(templates, purpose)` at `src/prompts/registry.ts:106-116`; defaults map `LLM_PROMPT_DEFAULTS` at `registry.ts:62-95`; wired into `buildPrompt` at `src/generation/generate-route/build-prompt.ts:17` |
| Scenario / persona / char card | `actorHeaderSection`, `userPersonaSection` (`registry.ts:47,51`); group participant injection `registry.ts:49` |
| World lore with activation gating | `loreSection` (`registry.ts:56`); cooldown gate `isCooldownExpired(lastActivated, cooldownSeconds)` at `src/assistant/prompt/sections/lore-activation.ts:119-128`; load query at `sections/lore-load.ts:50-53` |
| Plugin content | `pluginAgentRoleSection` (`registry.ts:48`) |
| Game-state emission | `gameStateSection` (`registry.ts:65`) |
| Memory (extraction → injection) | `memorySection` (`registry.ts:57`) + decision function `shouldInjectMemory(memory, config, ctx, comfort, lastInjectedTurn)` at `src/memory/injection/decide.ts:34-119`: hard privacy gate `:44-47`, pinned bypass `:52-54`, cooldown `:57-63`, probability `:66-110`, **semantic floor** `:99-105` |
| Regex/keyphrase-forced recall | `applyKeyphraseRecalls(ctx, selected, …)` at `src/assistant/prompt/sections/memories-keyphrase.ts:137`, per-message limit + per-(chat, memory) cooldown documented at `:13-15,128-130` |
| Few-shot examples | `examplesSection` (`registry.ts:74`) |
| History context cut | `postHistorySection` (`registry.ts:82`, placement rationale `:76-81`) |

### (b) Explicit gap

**TTS: no synthesis, no audio pipeline, no context re-entry.** If a turn were
synthesized, there is nowhere for its output to be re-injected — `post-store.ts`
(where post-generation side effects land) has no audio branch, and
`registerSideEffectJob` has no producer.

**Injection has no shared policy.** Lore uses cooldowns + confidence floors
(`lore-activation.ts:119`; `src/assistant/prompt/sections/lore.ts:90-93`), memory uses
a 10-step probabilistic pipeline (`decide.ts:34-119`), system prompts use straight
config override (`prompts/registry.ts:106`), plugin content is unconditional. Only
memory has priority ordering; only memory has a semantic-relevance floor; nothing has
a cross-mechanism "drop this first when over budget" beyond the static `PRIORITY`
table in `prompt-budget.ts:70`.

### (c) Smallest viable next step

TTS is net-new; nothing to extend. Do not build it inside the generation turn:

1. Add an audio adapter under `src/generation/providers/` (same seam as §1c) and expose it via the existing per-modality template route that currently 501s (`audio-prompt-templates.ts:11-12`). No new dispatch path.
2. Register it with the existing cancellation hook for free: `registerSideEffectJob(attemptId, { id, kind: "tts", cancel })` (`side-effects.ts:33`) — the fan-out already exists and is already exercised (`abort.test.ts:297-309`); nothing new is needed for the Stop button.
3. Do **not** inject audio output back into chat history. If a transcript is wanted, it belongs in the `postHistorySection` slot (`registry.ts:82`), not as a new role.

---

## 4. Loop and hallucination protection

### (a) Exists today — loop protection

**Repetition detection exists and is wired into the live streaming path.**

- Detector modules: `analyzeRepetition(text, config)` at `src/generation/repetition-detector/analyze.ts:15`; `StreamingRepetitionDetector` at `repetition-detector/streaming.ts` (exported `repetition-detector/index.ts:19`); `detectTheatricalLoop(text)` at `repetition-detector/theatrical.ts` (exported `index.ts:22`).
- Enforcement: `processStreamingChunk` feeds every chunk to `active.repetitionDetector.addChunk(chunk)` (`cancellation-actions/streaming.ts:74`, result handling `:75-136`), then combines `detectTheatricalLoop(active.repetitionDetector.getBufferText())` and cancels when `Math.max(repAnalysis.score, theatreCheck.score) >= 0.85` (`streaming.ts:99-103`).
- Tool-loop bound: `MAX_TOOL_ROUNDS = 5` (`generate-route/tool-execution.ts:48`).
- Policy-mismatch detection on a 5-chunk throttle: `detectPolicyMismatch` called at `streaming.ts:141-199`.

**Not found:** a `maxTurns` cap. Grep for `maxTurns|max_turns|repetition|loop-?break|dedupe|cooldown|repeatDetect` across `src/` returned no turn-cap symbol. Turn orchestration exists but is **speaker selection, not a loop guard**: `TurnStrategyFn` at `src/turning/types.ts:95-109` (signature confirmed; it receives `currentTurn: number` at `:98`, but no strategy read uses it as a limit), strategies `roundRobinSelect` (`turn-strategies.ts:67`), `sceneBasedSelect` (`:88`), `initiativeSelect` (`:106`), `questDrivenSelect` (`:163`), `hybridSelect` (`:187`, described as "classifier/scene selection with quest awareness every 5th turn" at `:186`), `STRATEGY_MAP` (`:227`). A cooldown exists but it governs *injection*, not turns: `isCooldownExpired` (`lore-activation.ts:119`) and the memory keyphrase cooldown (`memories-keyphrase.ts:14`).

`[UNVERIFIED]` I did not read `src/turning/turn-manager/state.ts` or `src/chat/scheduled/dispatcher.ts` in full; a cascade/auto-gen turn cap could live there. The claim is bounded to the grep above and the files I opened.

### (a) Exists today — hallucination protection

**Two real validators, both operating *after* generation.**

**(i) Entity hallucination detector.** `detectHallucinations({db, text, worldId, knownActorIds, knownLocationIds, knownEntityNames})` at `src/chat/hallucination-guard/detect.ts:23-84`: short-circuits under 20 chars (`:28-30`), extracts proper nouns (`:33`), loads known entities (`:40`), treats session-transient names as known (`:44-46`), and flags any unknown entity with `confidence >= 0.5` (`:60-67`). Exported from `src/chat/index.ts:64-68`.

Call sites (grep `detectHallucinations`): `src/generation/auto-gen/post-store.ts:127` and `src/generation/auto-gen/story-mode.ts:140`. Both run **after the message is already persisted** — `post-store.test.ts:7-12` documents this as a fixed bug (`BUG-bug-hallucination-guard-runs-outside-try-catch-after-message`). Known names are supplied by `resolveChatKnownEntityNames(database, chatId)` (`post-store.ts:126`, `story-mode.ts:139`; helper `src/generation/auto-gen/resolve-known-names.ts`).

**(ii) World-event validation.** `validateEvents({db, worldId, events})` at `src/story/events/validation.ts:89-116`, per-event check `validateSingleEvent(event, locationNames, locationIds)` at `:41-79`, returning `{ valid, filteredEvents, rejections }` (`:19-23`). This is the only place where **LLM-extracted structure is rejected before it mutates world state**.

### (b) Explicit gap

**Nothing validates free-text model output against game state.** Combat outcomes,
inventory changes, NPC facts, and status claims arrive as prose and are stored verbatim;
`detectHallucinations` inspects **proper nouns only** (`extractProperNouns` at
`detect.ts:33`) and its output is an advisory flag list consumed by
telemetry/tests — nothing blocks, rewrites, or re-prompts. `[UNVERIFIED]` I did not
read the consumer of `hallucinationAnalysis` beyond `post-store.ts:126-130`, so I
cannot rule out a downstream gate.

**Ordering is wrong for a guard.** The hallucination check runs *after*
`storeMessage` (documented at `post-store.test.ts:7-12`), so a hallucinating turn is
already in history when it is flagged.

**Structural output from non-event paths is unvalidated.** `executeToolCalls`
(`tool-execution.ts:155`) sanitizes HTML (`:67`) but validates nothing semantic about
the tool arguments; `MAX_TOOL_ROUNDS` (`:48`) bounds count, not content.

**No turn cap** (search terms above). Repetition detection cancels the *stream*, but
nothing stops a loop *between* turns (GM asks → NPC answers → GM asks again), because
turn termination is model-decided.

**Malformed streaming output:** there is no mid-stream schema validation. `ChunkEvent`
(`types.ts:131-137`) carries free-form `content` strings; malformed output surfaces as
an empty `result.content`, which `non-stream.ts:13` (file header) documents as being
rejected as an explicit error. Partial-parse-then-abort on malformed tool-call JSON is
not present in what I read of `tool-execution.ts`.

### (c) Smallest viable next step

1. **Reuse, don't build:** move the `detectHallucinations` call from after `storeMessage` to before it in `post-store.ts:126`, and give the analysis a defined action (today it is a bare result). A reordering inside one function, not a new subsystem.
2. **Add the missing turn cap** as one field. `TurnStrategyFn` already receives `currentTurn: number` (`src/turning/types.ts:98`); add the check where strategies are dispatched (`STRATEGY_MAP`, `turn-strategies.ts:227`) that force-advances rather than erroring. No new state.
3. **Leave tool-argument validation alone** unless a ticket asks — it is the one place where a wrong model claim has real blast radius (state mutation), and `story/events/validation.ts:89` already shows the shape of the answer if needed.

---

## 5. External services API integration

### (a) Exists today

**LLM egress is HTTP-only, per-provider HTTP layers, one shared retry policy.**

- Per-family HTTP layers, each with its own `fetchRaw`: `openai-compatible/http.ts:166`, `anthropic/stream.ts:47` (+ `anthropic/operations.ts:19` for `/v1/models`), `ollama-native/core.ts:93` and `ollama-native/operations.ts:19,48,91` (`/api/tags`, `/api/version`, `/api/embed`). `fetchWithRetry(state, path, body, signal?, apiKey?)` at `openai-compatible/http.ts:207-225`.
- **One shared retry policy**: `withProviderRetry(run, retries, signal?)` at `src/generation/providers/retry.ts:48-63`, built on Effect `Schedule.exponential` from `BASE_DELAY_MS = 1_000` capped at `MAX_DELAY_MS = 10_000` (`retry.ts:15-16,53-55`), with `classifyFailure(cause, signal)` at `retry.ts:30-38` distinguishing non-retryable `ProviderError` → cancelled → `AbortError` → retry-all. Its header (`retry.ts:6-10`) states it replaced byte-identical hand-rolled loops in anthropic, ollama-native, and openai-compatible.
- **One shared circuit breaker** (see §1a).
- **Timeouts are per-provider state**, `state.timeout`, applied in `fetchRaw` (`openai-compatible/http.ts:176-178`), not a central policy.
- **Error taxonomy is shared**: `ProviderError` / `ProviderAuthError` / `ProviderRateLimitError` at `src/generation/providers/types.ts:145-194`; HTTP status mapping in `handleErrorResponse(response)` (`openai-compatible/http.ts:237-275`); `Retry-After` honored in `CircuitBreaker.onFailure(providerName, retryAfterMs?)` (`circuit-breaker.ts:139`).

**Image generation: four families behind one dispatcher, no fallback chain.**
`generateImages(sdConfig, opts)` at `src/generation/image-engine/index.ts:27-61`, switching on `sdConfig.apiFamily` → `generateOpenAI` / `generateSDAPI` / `generateSDCPP` / `generateComfyUI` (`:36-52`), returning `ImageGenOutcome` and **never throwing** on provider failure (`:26`). URL validation via `validateProviderUrl(sdConfig.baseUrl)` (`index.ts:31`). Config selection `pickSdProvider(config.generation.providers.sd, "edit")` at `src/generation/image-edit-service/apply.ts:49`, with the same `validateProviderUrl` gate (`apply.ts:55`) and a per-`apiFamily` switch at `apply.ts:67-191`. Image edit orchestration `editImage({thisL, request})` at `image-edit-service/edit.ts:30-126`. Also: matting `fetch(new URL("/api/remove", config.baseUrl), {...})` at `src/generation/matting/providers.ts:131` (with `AbortSignal.timeout(timeoutMs)`), LoRA discovery across ComfyUI / SD-server / HTTP (`generation/lora/discovery-*.ts`), and workflow/job stores under `generation/builder/`.

**Admin health.** `src/admin/provider-health.ts:56` runs `Promise.allSettled([provider.healthCheck(), provider.listModels()])`, so a throwing provider yields `health: null` rather than a 500. `test-connection.ts:50-54` calls `provider.healthCheck()` and maps `status === "ok"` to `ok`.

**Integrations (email, external bridges).** `src/integrations/` contains `adapter.ts`, `bridge.ts`, `health.ts`, `secrets.ts`, `encryption.ts`, `registry.ts`, and `email/{adapter.ts, deliverability.ts, spam-gate.ts}`. `[UNVERIFIED]` — I listed this directory but did **not** read those files, so I cannot characterize their HTTP or retry behaviour.

**Federation.** `src/federation/peer-fetch.ts:67-70` (URL parse/validate) and `src/federation/spki-pin.ts:143-146` (SPKI pinning), with an injectable `postImpl` seam at `src/federation/outbox.ts:141-144`. `[UNVERIFIED]` — grep hits only, not read.

**Notifications are internal only.** `src/notifications/` contains `service/` (crud, prefs, **triggers**, service, types) — no transport directory. `[UNVERIFIED]` — listed only.

**Local binaries.** `findBinary("llama-cpp")` / `"llama-swap"` (`server-external-manager/start-llama.ts:106,175`), `spawn({cmd: args, ...})` (`start-llama.ts:143,186`), health-gated by `waitForHealth("http://127.0.0.1:${port}/health", {timeoutMs: 120_000})` (`start-llama.ts:145`) and `waitForPort(port, {timeoutMs: 30_000})` (`start-llama.ts:193`).

**Config / secrets surface.**

- Env overrides: `applyEnvironmentOverrides(config, environmentMap)` at `src/config/load/env.ts:14-26` (structuredClone, set-by-path over an explicit map), `applyProviderEnvVars(config)` at `env.ts:77`.
- **Secrets are NOT env-only.** Keys live in config files *and* can be overridden by env; the merged config wins over raw `process.env` for PII secrets (`src/config/load/pii-safety.ts:36-60`, `resolvePiiSecret` at `:46`). PII secrets have a prod-gated minimum length of 32 (`MIN_PII_SECRET_LENGTH`, `pii-safety.ts:9`; `assertPiiLength` `:118-126`; `validatePiiSafety(config)` `:135-141`), with `isDevEnv()` (`:18-22`) selecting a dev fallback (`:11-13`). **Provider API keys have no equivalent length/entropy guard.**
- `validateAuthSafety(config)` at `src/config/load/safety.ts:77` enforces `MIN_JWT_SECRET_LENGTH = 32` (`:55`) at boot when `auth.required` is true.
- Per-user BYO keys: `resolveProvider({provider, model, userId, config, db})` (`registry.ts:110`), with per-request `apiKey` override on `GenerateRequest` (`types.ts:74`) and `effectiveApiKey = apiKeyOverride ?? state.apiKey` at `openai-compatible/http.ts:180`. `[UNVERIFIED]` I did not trace BYO-key storage/encryption (`config.byokey.schema.json` and a byokey service exist).

### (b) Explicit gap

**There is no single HTTP client.** Each provider family owns a private `fetchRaw` (`openai-compatible/http.ts:166`, `anthropic/stream.ts:47`, `ollama-native/core.ts:93`), matting calls `fetch` directly (`matting/providers.ts:131`), and image engines do the same. Only the *retry* policy is shared (`retry.ts:48`); headers, timeout wiring, error mapping, and `Retry-After` extraction are re-implemented per family.

**No fallback chain for image generation.** `generateImages` (`image-engine/index.ts:36-61`) is a single-family switch — an unknown `apiFamily` yields `501` (`:54-60`), not a try-the-next-provider attempt. The LLM path has `buildFailoverList` + `callWithFailover`; the image path has neither.

**Retry/timeout/rate-limit policy is split.** Retry is centralized; timeouts are per-provider state (`http.ts:176`); rate limiting is a separate *inbound* subsystem (`src/api-governance/rate-limiting/`: `slidingWindow` at `algorithms.ts:42`, `limiter.ts:64`) that does not govern provider egress.

**Provider API keys are the one secret class without a prod-gated strength check** (`pii-safety.ts:135` covers NSFW PII / reporter-hash / telemetry PII; `safety.ts:77` covers JWT).

### (c) Smallest viable next step

1. **One retry/timeout policy, not one HTTP client.** Thread `retries` + `timeout` through the existing `withProviderRetry` call so `state.timeout` stops being a per-family default — the signature already accepts both (`retry.ts:48`); the duplication is the *values*, not the mechanism.
2. **Image fallback chain:** mirror the LLM shape. Add `buildImageFailoverList(config, purpose)` returning an ordered `ImageProviderConfig[]` and loop it inside `generateImages` (`image-engine/index.ts:27-61`) before hitting the `501` branch (`:54-60`). The discriminated `ImageGenOutcome` return type (`:26`) already carries the failure needed to decide whether to advance — no signature change.
3. **One secret guard for provider keys:** extend `validatePiiSafety` (`pii-safety.ts:135`) with an empty-key-rejected check for configured provider instances. Matches the existing pattern exactly.

---

## Method and coverage

- Searches used (grep tool over `src/`): `callWithFailover|provider.complete(|provider.stream(`; `Bun.spawn|spawn(|execSync|child_process|execFile|Bun.spawnSync`; `maxTurns|max_turns|repetition|loop-?break|dedupe|cooldown|repeatDetect`; `tts|text-to-speech|textToSpeech|speechSynthesis|voice_id|elevenlabs`; `detectHallucinations|pruneMessages|compressMessages|analyzeRepetition|detectTheatricalLoop`; `registerSideEffectJob(`; `healthCheck|health-check|testConnection`; `fetch(...|new URL(`; `\bmcp\b|model.context.protocol`.
- Files **not** opened, so their contents are not characterized here: `src/integrations/**` (listed only), `src/notifications/**` (listed only), `src/federation/**` (grep hits only), `src/config/sections/**` (grep hits only), individual builders under `src/assistant/prompt/sections/*` (registry entries only), `src/generation/context-compressor/strategies.ts` and `compress.ts` (signature only), `src/generation/providers/base.ts:92-180`, `src/generation/providers/registry.ts` bodies, `src/turning/turn-manager/*`, `src/chat/scheduled/*`.
- No source file was modified. No tests, linters, or builds were run.
