<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## Post-P3 — Road to Happy 0.1.0

`package.json` already declares `version: 0.1.0`. "Happy 0.1.0" = Gate C **and** the
release-hardening below all green, then a signed tag + release notes. Consolidated
tracking: `epic-release-010.md`.

> **2026-08-16 update:** Feature matrix items promoted to P4/P5/P6 tiers
> (`priority-p3-p5.md`, `priority-p6.md`). Lint-ts + e2e closed (2026-08-14).
> `dev` pushed to `origin/dev`; `work` pushed to `origin/work`.
> Release blockers: A8 (unwired close-out) + A9 (artifacts + push + tag).

### Definition of "happy"

- **Gate C** — VN, chat, assistant+tool calling, GM flows, GM-guided story, auth/access,
  gallery usable. **Complete — all core + GM-guided story shipped to `dev` (2026-08-14)**.
- **Gate D** — P3–P5 0.1.0 value tiers operational; P6+ non-blocking.
- **`bun run check` gate green (2026-08-14)** — lint-ts closed (0 errors, warnings
  tracked); dprint + md-lint also green (pre-existing YAML-twin + ticket-format issues
  fixed in `lint-ts-debt` worktree).
- **e2e browser suite stable ✅ (2026-08-14)** — `test:e2e:browser` green across two
  consecutive runs (`e2e-stabilization` worktree: raised setup budgets, page-load
  timeouts, `ctx?.close()` guard).
- **No committed-state-only gates** — GM role runtime effect ✅ committed on `dev`
  (2026-08-07+); no remaining "works locally" claims.

### Open → close (blocking release)

- [x] **Lint-ts debt** — ✅ closed 2026-08-14 (`lint-ts-debt` worktree) — 68→0 errors; warnings tracked; `bun run check` gate green. Last red gate gone.
- [x] **Size-strict debt** — ✅ closed 2026-08-12 (no files over the size limit).
- [x] **e2e browser stabilization** — ✅ closed 2026-08-14 (`e2e-stabilization` worktree) — timeout budgets raised + `ctx?.close()` guard; `test:e2e:browser` green ×2.
- [ ] **Unwired/leftover close-out (A8)** — crafting stations/execution + trade lifecycle/NPC trading remain (see `epic-rpg-wiring-phase3.md`); LoRA routes wire-or-drop decision; SSE refactor ✅ committed (`082c20cf`; row W4 resolved in `../open-inflight.md`).
- [~] **Release artifacts (A9)** — `docs/meta/release-process.md` ✅, changelog/release notes ✅ (`CHANGELOG.md`); **tag `v0.1.0` NOT created — post-testing human decision (never agent-side); **push `dev`→`origin/dev` ⏳ HUMAN** (pre-push hook blocks agent).

### Hardening (before tagging, non-blocking)

- memorySection cross-actor integration test — ✅ shipped (`src/assistant/prompt/sections/memories.test.ts`)
- AUX queue M5–M6 — M5 ModerationHook safety ✅ shipped (2026-08-06); M6 AUX telemetry ✅ done (2026-08-18)
- World timeline §5.3 forward-event steering + §5.4 cross-story convergence (cluster B greenfield)
- Frontend gaps in P2-B/C/D/E (music linking, party join/leave, unified GM↔assistant view, creation wizards, avatar-gallery visibility inheritance)
- `.plan/open-items.md` — resolved: consolidated into `.plan/backlog/open.md` (2026-08-06)

## 0.1.0 Quick Wins — Emergent-Platform Analysis (2026-08-14)

> Features that **land in 0.1.0** (no P6+ blocker), drawn from the emergent-platform
> sweep (inspiration: Kindroid, Nomi, SillyTavern QR, RisuAI dynamic-*, Inworld AI,
> generative-agents, Luma/Runway). Mapped to existing epics, in-flight P2–P5 work,
> and matrix gaps G18–G23. Full analysis: `docs/ideas/emergent-platform-landscape-2026.md`.
>
> These build on infrastructure **already shipped** — slash-command parser (21 handlers),
> tool-call SSE (migration 037), memorySection (1024-token), regex extraction pipeline,
> emotion avatars, prompt registry, VN mode, item-systems backend.

| # | Capability | Builds on | Effort | Dependencies | Matrix gap |
| -- | ---------- | --------- | ------ | ------------ | ---------- |
| 1 | **Quick-Reply / event-driven automation** — button sets + auto-execute on startup/user/ai events (SillyTavern QR, RisuAI dynamic-* inspiration) | Slash-command parser + 21 handlers (`messages.ts:543`), regex pipeline | Med — **core shipped (2026-08-16)** | None — pure frontend + thin route | G22 |
| 2 | **Dynamic memory writes via tool-call** — assistant emits durable memory note mid-response (RisuAI dynamic-memory inspiration) | Tool-call SSE (`messages.tool_calls`, migration 037), memorySection | **Done (2026-08-16)** | Memory selection UI (item 5) for UX | G23 |
| 3 | **Emotion-reactive portraits** — extend existing emotion avatars with `<Emotion>` tag + per-emotion sprite swap (RisuAI/SillyTavern inspiration) | Emotion avatars (shipped), `avatarForMessage()` wired in `message-list.html:51`, assets polymorphic linking | **Done** — per-message emotion-avatar resolution complete | Per-character emotion images in gallery | G21 (partial) |
| 4 | **Regex output-transform phase split** — extend regex pipeline from single-phase to 4-phase (editinput/output/process/display) (RisuAI 4-phase inspiration) | Regex extraction pipeline (`src/regex/`) | Low–Med | None — pure logic + frontend toggle | G22 (partial) |
| 5 | **Memory selection UI — mid-chat pinning** — select/memory-pin/purge UI in chat sidebar (emergent ambient-memory trend: Kindroid, Nomi, Zhumu) | MemorySection, cross-chat memory (shipped), B8 in-flight | Low–Med | B8 already in-flight — this is the UX layer | G23 (partial) |
| 6 | **Template injection UX** — registry impl shipped → read-only prompt preview in chat settings modal (2026-08-14). Open: inline override per-chat | Prompt registry, `GET /api/v1/chats/:id/prompt-template`, chat-settings modal | **Done (2026-08-16)** — `prompt_override` column (migration 044), per-chat override + save/clear in settings modal; assembler precedence per-chat > world-setup > character | None — frontend only | — |
| 7 | **In-chat asset preview + linkage side panel** — gallery assets viewable/linkable without leaving chat (P4/P5 row) | Gallery + assetRoutes (shipped), chat-side-panel UI | Med | Signed URLs (C6 in-flight) | G21 (partial) |
| 8 | **Creation wizards (assistant)** — character/world/location/item creation wizard flows via assistant (P2-C/P4 in-flight) | Assistant tool-call UI, creation-wizard prompts, assistant commands | Med | Assistant commands extension (C3 in-flight) | — |
| 9 | **GM-guided story (P2-Da)** — the one Gate-C remainder: participant type, `/guide` command, guidance panel, turn-order wiring | GM panels + quest log (shipped), slash-command parser | Med–High | None — greenfield | — |
| 10 | **Vector RAG / embeddings foundation** — first-class embeddings support for semantic memory recall (candidate #1, SillyTavern DataBank inspiration) | LLM providers (P3 #15 embeddings greenfield), memorySection | Med–High | Provider: OpenAI/local embedding endpoint | — |
| 11 | **Asset-consistency reference conditioning** — keep character look across generated images via reference image; **Master Reference Asset pattern** (Luma): multi-angle reference packs + structured blueprint doc + locked identity features + always re-anchor to Master Reference (Luma/Runway/Krea inspiration) | Emotion avatars + text2img providers, asset system | Med–High | Provider: img2img with reference conditioning; `TASK-dynamic-avatars-dota-style` (existing) | G21 |
| 12 | **Chat-type matrix UI remainder** — group-chat UI + unified GM↔assistant view (P2-B/P2-D in-flight) | GM panels (shipped), chat-types backend | Med | ✅ turn-order indicator + side-channels shipped 2026-08-16 (`chat-matrix-ui-remainder`); GM↔assistant reconciliation (E1 open) | — |
| 13 | **Proactive messaging** — 4 frequency levels + quiet hours; memory-driven topic selection; game-time awareness (Nomi.ai inspiration; matrix agentic addendum) | memorySection (1024-token), cross-chat memory (shipped), notifications SSE + center (shipped) | Med | ✅ **Done (2026-08-16)** — send + backoff routes, reset-wiring, save UI, client scheduler; see § Status. Quiet-hours ↗ `TASK-quiet-hours` (per-character override) | G38, G39 |
| 14 | **Keyphrase-triggered journal recall** — chat token stream matches keyphrases → inject journal memories (Kindroid inspiration; matrix agentic addendum) | chat SSE stream, memorySection, prompt registry | Med | None — chat-side matching + memory injection | G40 |
| 15 | **Encounter + bestiary generation** — generative encounter/bestiary/world-state synopsis for battle + NPCs (AI-GM landscape: Fables.gg/StoryRoll/AI Realm; Bucket B of emergent sweep) | Battle + NPC systems, assistant tool-calling (shipped), generation hooks | Med | Encounter templates (`TASK-battle-encounter-template-system.md`); NPC services | — |

### Status (2026-08-16)

Shipped via worktree `quick-wins` (→ dev):

- Item 1 **core** — `quick_replies` column (migration 045), buttons row, modal editor, startup trigger.
- Item 2 — `write_memory_note` builtin tool (2k cap, dedupe, scope character, ctx {db,actorId,chatId}).
- Item 6 — `prompt_override` column (migration 044), per-chat override + save/clear; assembler precedence per-chat > world-setup > character.

Shipped 2026-08-16 (backlog review session, on `dev`):

- **Item 1 remainder** — user/ai event triggers **shipped** with loop-guard in `chat-quick-replies.ts`: `fireAutoQuickReplies("user"|"ai")`, human-send discrimination via `_autoFired`, min-interval rate limit (3s), consecutive cap (5) that breaks the ai→send→ai feedback loop. Wired into `sendMessage` (user hook) + SSE `stream-done` (ai hook). Tests: `chat-quick-replies.test.ts` (9 cases).
- **Item 4** — regex **4-phase split** shipped in `src/generation/transforms.ts` + `src/config/schema/generation.ts`: `RegexTransform.phase` (`edit-input|output|process|display`, default `output`), phase-grouped canonical ordering. Config-driven (no render hook / UI toggle — display and output both apply pre-persist). Tests: `transforms.test.ts` (3 new phase cases).
- **Item 5** — memory selection / pin UI **verified already shipped** (backlog was stale): `src/frontend/alpine/memory-panel.ts` (load/split/create/delete/toggleMemoryPin/token-budget) + pin round-trip backend (`actor-memories-pin.test.ts`). No new code; unblocks item 13 topic-selection UX.
- **Item 13** — proactive messaging **shipped end-to-end** (2026-08-16, on `dev`): dormap backend service + CRUD routes were already present — this session wired the trigger path. `POST /api/proactive-messaging/send` (re-checks `checkShouldMessage`, anchors in-thread to last message, reuses `triggerAutoGeneration`, `recordSent` + system notification; 409 when not due), `POST /api/proactive-messaging/backoff` (increment), reset-wiring in `messages/create.ts` (user response resets backoff), `saveProactiveConfig` in the character edit form, and a client scheduler `chat-proactive.ts` (60s poll of configs+check, one send/tick, 10s min + in-flight guard). Tests: `proactive-messaging.test.ts` (4 route) + `chat-proactive.test.ts` (5 scheduler). Ticket `TASK-proactive-messaging.md` ✅.

Remaining (next session):

- **Items 7, 8, 9, 12** — in-chat asset preview, creation wizards, GM-guided story, chat-type matrix UI remainder.
- **Items 10, 11, 14, 15** — embeddings, asset-consistency conditioning, keyphrase recall, encounter/bestiary gen.

Finalize-blocking cleanup (quick-wins, deferred — `--force` merge approved):

- `size - strict`: `src/routes/chats/manage.ts` (251L), `src/frontend/alpine/chat/index.ts` (251L), `src/frontend/alpine/chat-types/core.ts` (253L) — split past the 250L limit (see 04). Ignored for merge per instruction.
- `lint - ts`: deno/package-json duplicate-manifest warnings (pre-existing, not from quick-wins).

**0.1.0 sequencing recommendation (by ROI):**
- **First wave** (low effort, high delight): items 3, 4, 6 — pure logic/frontend, no new infra
- **Second wave** (medium effort, high user-value): items 1, 2, 5 — extends shipped slash/automation infra
- **Third wave** (medium effort, gate-critical): items 7, 8, 12 — frontend wiring to close P4/P5
- **Must-land** (release-blocking): item 9 (GM-guided story, Gate-C remainder)
- **P4 foundation** (medium-high, starts embeddings): item 10 — don't defer past 0.1.0 if feasible
- **P6+ pull candidates** (if time permits): item 12 — chat matrix remainder
- **Pulled from P6-E (2026-08-15)**: items 13, 14 — proactive messaging + keyphrase recall (matrix rates "Quick win (0.1.0)")
- **Promoted from P6+/new (2026-08-15)**: items 11, 15 — asset-consistency + encounter/bestiary gen (emergent sweep: E4 "pull now"; Bucket B "concrete pull candidate")

**Cross-ref:** matrix gaps G21 (asset-consistency), G22 (event-driven automation), G23 (dynamic memory) are the emergent-sweep quick wins with **no P6+ blocker** — all achievable in 0.1.0. G38–G40 (proactive messaging, quiet hours, keyphrase recall) joined 2026-08-15. Emergent sweep E1–E8 (agent memory, living-world, voice) stay P6+ — fold into existing epics per `emergent-platform-landscape-2026.md` Open Q1.

