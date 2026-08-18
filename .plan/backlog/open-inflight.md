<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## In-flight / decision queue — rows needing a finalize-vs-defer call

> When a row is decided: finalize → check off in its `../priority.md` (index — tier files below) tier; defer → keep
> here in the Deferred section. Rows already shipped or explicitly deferred are removed.
> Rows that mirror a `../priority.md` (index) tier or a section below are removed here.
>
> **2026-08-16 update:** Feature matrix items FEAT-055/059/060/062/065/066/067/068/075/045-047/048-051 promoted to P4/P5/P6 tiers. Lint-ts + e2e confirmed closed. 0.1.0 release-blocking: A8 (unwired close-out) + A9 (artifacts + push).

| ID  | Item                                                                                    | Ticket / where                               | Recommend                       | Decision              |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- |
| A5  | Lint-ts debt → `check` lint gate red — 655 problems (64 errors + 591 warnings), **last red gate**. Plan: `TASK-PLAN-LINT-TS-DEBT.md` (44 errors auto-fixable, 20 manual) | `../priority-release-010.md` + ticket | ▲ now (release-blocking) | ✅ **CLOSED 2026-08-14** (worktree `lint-ts-debt`) — `bun run lint` EXIT 0 (0 errors; 193 warnings tracked); check gate **18/18** |
| A7  | e2e browser stabilization (auth redirect-loop)                                          | `../priority-release-010.md`              | ▲ now                           | ✅ **CLOSED 2026-08-14** (worktree `e2e-stabilization`) — flake was timing (45s beforeAll, 5-15s page loads), not redirect logic; `test:e2e:browser` **19/19 files ×2** |
| A8  | Unwired-code close-out (crafting stations/execution + trade lifecycle/NPC trading; LoRA wire/drop)       | `../priority-p3-p5.md` + `epic-rpg-wiring-phase3.md` | ▲ now                     | ✅ **CLOSED 2026-08-18** (worktree `feature/a8-unwired-closeout`, `49ee5c1a`) — all IS1-IS7 + LoRA wired; full gate 22/22 green |
| A9  | Release artifacts (release-process, changelog) + push `dev`→`origin/dev`                | `../priority-release-010.md`              | ▲ now                           | 🟡 `docs/meta/release-process.md` + `CHANGELOG.md` done 2026-08-15; **tag v0.1.0 deliberately NOT created — post-testing human decision, never agent-side**; **push pending: pre-push hook blocks agent, human must push** |
| B8  | Memory selection UI (mid-chat, pinning) + prompt-template UX                           | `../priority-p3-p5.md`                          | ▲ now                           | ✅ done (memory-selection UI + assistant/world tabs shipped dev 5e62eea7; prompt-template preview 2026-08-14) |
| B10 | Fine-tuning UX (provider health, fine-tune UI)                                         | `../priority-p3-p5.md`                          | ▲ now                           |                       |
| C1  | Chat-type matrix UI remainder (group-chat UI, unified GM↔assistant view)               | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial (participant panel shipped 2026-08-14; **turn-order indicator + side-channels shipped 2026-08-16** in `chat-matrix-ui-remainder`; unified GM↔assistant view is the separate E1 row) |
| C2  | NSFW 5-tier character rating runtime enforcement                                       | `../priority-p3-p5.md`                          | ▲ now                           |                       |
| C4  | Char/world/location flows (multi-format import, creation + export/import menus)        | `../priority-p3-p5.md`                          | ▲ now                           |                       |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                               | `../priority-p3-p5.md`                          | ▲ now                           | 🟡 Anthropic + Ollama native providers shipped 2026-08-17 (`chat-matrix-ui-remainder`); Bedrock deferred (AWS SigV4 scope) |
| C6  | Assets signed URLs (compression flow ✅ 2026-08-12)                                    | `../priority-p3-p5.md`                          | ▲ now                           |                       |
| C7  | Group-chat VN party join/leave                                                         | `TASK-travel-party-migration.md`             | ▲ now                           |                       |
| D1  | Assistant panel in chat sidebar                                                        | `../priority-p0-p2.md`                        | ▲ now                           |                       |
| D2  | Message actions UI (edit/delete/pin/react)                                             | `../priority-p0-p2.md`                        | ▲ now                           |                       |
| E2  | GM-guided story (user-as-GM UI + doc) — **Gate C remainder**                           | `../priority-p0-p2.md`                       | ▲ now                           | ✅ **DONE 2026-08-14** — UI + persistence + orchestrator consumption (`4b0dd146` threads `gmGuidance` into `GameMasterService`; ticket `TASK-gm-guided-story-creation.md` ✅) |
| F3  | M6 AUX telemetry (tokens/latency per call)                                              | `../priority-release-010.md`                   | ▲ now                           | ✅ **CLOSED 2026-08-18** (worktree `feature-f3-aux-telemetry`) — `aux.call` telemetry events, `generation.completed` latencyMs fix, `GET /api/admin/telemetry/aux` endpoint, 5 AUX sites verified |
| G2  | World timeline §5.3 forward-event steering + §5.4 cross-story convergence              | `epic-world-timeline*` (cluster B)           | ▲ now                           |                       |
| G6  | Avatar-gallery visibility inheritance                                                  | `../priority-p0-p2.md`                        | ▲ now                           |                       |
| W3  | **Push `dev` → `origin/dev`** (Gate C + item-systems + docs-reconcile + memory-selection UI + C1 panel + GM-guided story + 7 wired RPG services) | `dev` (unreleased) | ▲ before release | |
| C3  | Assistant tooling remainder — creation wizards + tiered `/commands` (tool-call display ✅) | `../priority-p0-p2.md`                     | ▲ now                           | 🟡 partial (shipped: tool-call UI 2026-08-12) |
| D3  | Expand command buttons (GM role switching ✅)                                           | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial             |
| E1  | Unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12)                      | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 **C1 remainder DONE 2026-08-18** — unified 5-tab "GM & Assistant" panel (Shadow/Whitenotes/Story/Quests/Assistant) merges the separate 🎭/📜/👥 toggles into one sidebar; header/story-view/input-area controls route in toggle-aware via `openGmAssistantTab` (worktree `unified-gm-assistant-view`, commit `ffa776da`) |
| W5  | **Chat frontend wiring + search + navigation** — WT1 (pins/location/transfer/archive/response-length/route-extract) + WT2 (FTS5 message search + room filters) + WT3 (section navigation + VN wiring + state tests) | `TASK-chat-pins-frontend.md`, `TASK-chat-message-search.md`, `TASK-chat-room-filters.md`, `TASK-chat-flow-section-navigation.md`, `TASK-chat-visual-novel-mode.md` | ▲ now | 🟡 **in progress** — worktree `chat-ux-complete` |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · G3 (external music
linking) · G4 (authoring ownership indicators) — these sit in § Hardening / deferred
clusters below. Rows removed here: all shipped since last refresh — **B1** (register
frontend page ✅ 2026-08-12), **B7** (prompt-template registry `src/prompts/registry.ts` ✅
2026-08-12), **A6** (size-strict ✅ closed 2026-08-14 — re-cleared: chat-settings, chat-types/core, crafting/recipes split), **F2** (M5
ModerationHook ✅), **B2–B6/B9, A1–A4, A#-domain, G1** (previously resolved), **W1** (worktree
`rpg-wire-routes` ✅ merged 2026-08-14), **W2** (worktree `docs-reconcile` ✅ merged
2026-08-14), **W4** (SSE refactor ✅ committed `082c20cf`), and MFA (deferred P6+).
"Remove dead rule `detectIntent`" (D4) dropped — already Removed 2026-08-07 (see § Dead / unwired code).

**Stale/dup (no decision needed):** login page htmx — auth views already exist.

## Open / next actions (2026-08-15, after 51a7bc01 wiring + GM-guided merge)

## Open / next actions (2026-08-16, feature matrix promotion)

- **Feature matrix items promoted** — 10 FEAT tickets mapped to P4/P5/P6 tiers in
  `priority-p3-p5.md` + `priority-p6.md`. New upcoming work:
  - **P4**: Lorebook activation (FEAT-055), Prompt library expansions (FEAT-065),
    Model capability registry (FEAT-067), Token budget advisor (FEAT-068),
    Conversation branching (FEAT-045–047)
  - **P5**: Conversation analytics (FEAT-059), Model comparison A/B (FEAT-060),
    Gen quality metrics (FEAT-062), Lore-consistency checker (FEAT-066),
    Memory access audit (FEAT-075), API versioning (FEAT-035–044)
  - **P6**: Plugin system (FEAT-048–051 → P6-I), CI/CD pipeline (P6-J),
    Knowledge graph vis (FEAT-061 → greenfield)
- **W3: Push `dev` → `origin/dev`** — dev ahead (unreleased: Gate C, GM-guided story,
  item-systems + 7 wired RPG services, docs reconciliation, memory-selection UI, C1
  panel). Before release (row A9). Pre-push hook blocks agent commits — human push
  required.
- **A5 lint-ts debt (CLOSED 2026-08-14)** — `tree/lint-ts-debt`: 68→0 errors,
  `bun run lint` EXIT 0; `bun run check` 18/18 (incl. dprint + md-lint fixes for
  pre-existing YAML-twin + ticket-format issues). 193 warnings remain tracked.
- **A7 e2e browser stabilization (CLOSED 2026-08-14)** — `tree/e2e-stabilization`:
  timeout budgets raised (beforeAll 45s→90s, page loads 10-15s→30s, waits 5-8s→10-15s)
  plus `ctx?.close()` guard; `test:e2e:browser` 19/19 files ×2 clean runs. Redirect
  logic was correct (fe-fetch already guards login/register); flake was timing.
- **Remaining release blockers: A9** (tag v0.1.0 + push) — A8 closed 2026-08-18 (`49ee5c1a`).
- **Broken internal markdown links (resolved 2026-08-14)** — the 17 dead links
  flagged pre-merge (across `docs/README.md`, `docs/spec/build-deploy.md`,
  `battle-integration.md`, `nsfw-integration.md`) are fixed: `bun run md:links` ✅
  green (196 files, 0 broken). The `docs-reconcile` merge landed the target-path
  corrections; no follow-up ticket needed.
- **dprint docs-formatting bug (fixed 2026-08-14, `d183b9d0`)** — dprint's markdown
  plugin truncated `docs/` table cell content with `…` ellipses and stripped spaces
  inside inline-code spans (`docs/reference/api.md`). This is what the prior session
  mis-attributed to "api.md backticks". Fixed by excluding `docs/**` from dprint
  (markdownlint stays the docs authority); the 2 corrupted docs files reverted to
  their lint-clean HEAD state. `format:dprint` + `md:lint` both green.
- **Gate reality corrected (2026-08-14)** — prior "remaining red gates" report was
  stale on 2 of 3: lint-ts is **655 problems (64 errors + 591 warnings)**, not
  "~196 warnings"; dprint blocker was **173-file TS trailing-comma drift**, not
  `docs/reference/api.md`. Only md-lint (84 issues/12 files) matched. Corrected
  counts now in `TASK-PLAN-LINT-TS-DEBT.md` / row A5. dprint + md-lint gates closed;
  lint-ts remains open (see A5).

