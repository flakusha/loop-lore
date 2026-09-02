<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## In-flight / decision queue — rows needing a finalize-vs-defer call

> When a row is decided: finalize → check off in its `../priority.md` (index — tier files below) tier; defer → keep
> here in the Deferred section. Rows already shipped or explicitly deferred are removed.
> Rows that mirror a `../priority.md` (index) tier or a section below are removed here.
> **2026-08-16 update:** Feature matrix items FEAT-055/059/060/062/065/066/067/068/075/045-047/048-051 promoted to P4/P5/P6 tiers. Lint-ts + e2e confirmed closed. 0.1.0 release-blocking: A8 (unwired close-out) + A9 (artifacts + push).
>
>
> **2026-09-01 update:** Dev-fix review found 3 BUGs requiring action (planning only, no code today):
> one HIGH-severity reopened security-boundary (idempotency user-scope) and two
> medium-tier coverage fixes (account-tier custom-instructions preamble, dh-ratchet
> out-of-order tests). See `.tmp/next-batch-2026-09-02-plan.md` for full triage and
> recommended tomorrow order.
>
> **2026-09-02 update:** planning branch `plan-emotion-avatar-epics` adds the
> emotion-avatar + asset-platform epic bundle (5 new/extended epics, AV-matrix,
> 4 P4 tier rows, README registry) — **docs only, no code**; after finalize the
> `.plan/` bookkeeping pass listed at the end of `matrix-emotion-avatar-assets.md`
> (ticket creation, duplicate-ticket reconciliation, binding-epic path drift,
> AV3/AV4/AV8/AV10 open decisions) is required.
>
> **2026-09-02 update (2):** planning branch `plan-2fa-channel-integrations` reopens the
> MFA deferral for **planning only**: new `epic-auth-channel-provisioning.md` (verified-factor
> login/unlock across messenger / e-mail / federated channels, unlock ladder, anti-takeover
> cooling-off), rewritten `epic-two-factor-auth.md`, `matrix-authentication-channels.md`
> (AC1–AC12 + shared contracts + 2FA ticket reconciliation), backlog rows (P2-E note,
> P4 proposal, deferred #7 flip). Implementation scheduling stays a human triage call.

| ID  | Item                                                                                    | Ticket / where                               | Recommend                       | Decision              |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- |
| A5  | Lint-ts debt → `check` lint gate red — 655 problems (64 errors + 591 warnings), **last red gate**. Plan: `TASK-PLAN-LINT-TS-DEBT.md` (44 errors auto-fixable, 20 manual) | `../priority-release-010.md` + ticket | ▲ now (release-blocking) | ✅ **CLOSED 2026-08-14** (worktree `lint-ts-debt`) — `bun run lint` EXIT 0 (0 errors; 193 warnings tracked); check gate **18/18** |
| A7  | e2e browser stabilization (auth redirect-loop)                                          | `../priority-release-010.md`              | ▲ now                           | ✅ **CLOSED 2026-08-14** (worktree `e2e-stabilization`) — flake was timing (45s beforeAll, 5-15s page loads), not redirect logic; `test:e2e:browser` **19/19 files ×2** |
| A8  | Unwired-code close-out (crafting stations/execution + trade lifecycle/NPC trading; LoRA wire/drop)       | `../priority-p3-p5.md` + `epic-rpg-wiring-phase3.md` | ▲ now                     | ✅ **CLOSED 2026-08-18** (worktree `feature/a8-unwired-closeout`, `49ee5c1a`) — all IS1-IS7 + LoRA wired; full gate 22/22 green |
| A9  | Release artifacts (release-process, changelog) + push `dev`→`origin/dev`                | `../priority-release-010.md`              | ▲ now                           | 🟡 `docs/meta/release-process.md` + `CHANGELOG.md` done 2026-08-15; **tag v0.1.0 deliberately NOT created — post-testing human decision, never agent-side**; **push pending: pre-push hook blocks agent, human must push** |
| B8  | Memory selection UI (mid-chat, pinning) + prompt-template UX                           | `../priority-p3-p5.md`                          | ▲ now                           | ✅ done (memory-selection UI + assistant/world tabs shipped dev 5e62eea7; prompt-template preview 2026-08-14) |
| B10 | Fine-tuning UX (provider health, fine-tune UI)                                         | `../priority-p3-p5.md`                          | ▲ now                           | ✅ **CLOSED 2026-08-20** (worktree `b10-finetune-ux` merged `3cdbb05d`) — admin fine-tune page (`src/frontend/alpine/admin-models/fine-tune.ts` 99L), provider health (`admin-health.ts`), admin view + e2e tests (467 lines); `bun run check` 22/22 green |
| C1  | Chat-type matrix UI remainder (group-chat UI, unified GM↔assistant view)               | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial (participant panel shipped 2026-08-14; **turn-order indicator + side-channels shipped 2026-08-16** in `chat-matrix-ui-remainder`; unified GM↔assistant view is the separate E1 row) |
| C2  | NSFW 5-tier character rating runtime enforcement                                       | `../priority-p3-p5.md`                          | ▲ now                           | ✅ **DONE** (code-verified 2026-08-20) — ContentRatingSchema 5-tier union in src/validation/schemas/primitives.ts; createRatingEnforcement computes effective_limit = min(actor\| user\| chat); isRatingAllowed gates content; NsfwHook registered in src/generation/hooks/registry.ts + initialized in src/server/start.ts; enableNsfwHooks flag wired to hook chain; 5-tier select in character editor form; persistence via actors.content_rating column (migration 010_character_systems) |
| C4  | Char/world/location flows (multi-format import, creation + export/import menus)        | `../priority-p3-p5.md`                          | ▲ now                           | ✅ **DONE** (code-verified 2026-08-20) — char import: import-modal.html drag-drop multi-format (PNG&#47;YAML&#47;TOML&#47;JSON&#47;CHARX) ✅; char export: export-modal.html PNG&#47;JSON&#47;YAML&#47;TOML ✅; world import: world-import&#47;routes.ts multi-format bundle ✅; world export: worlds&#47;&#58;id&#47;export + exportWorld in src&#47;frontend&#47;pages&#47;worlds-io.ts ✅; location creation: inline in world-detail.html ✅; location export: bundled in world export (not separate route) ✅; all routes registered in register-plugins.ts ✅ |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                               | `../priority-p3-p5.md`                          | ▲ now                           | 🟡 Anthropic + Ollama native providers shipped 2026-08-17 (`chat-matrix-ui-remainder`); Bedrock deferred (AWS SigV4 scope) |
| C6  | Assets signed URLs (compression flow ✅ 2026-08-12)                                    | `../priority-p3-p5.md`                          | ▲ now                           | ✅ **DONE** (C6, commit `6b4e1ab4`) — HMAC-SHA256 signed URLs (`src/assets/controller/signed-url.ts` + `signed-url-routes.ts`), served on raw/download/thumb/compressed, frontend download/copy/preview via signed URLs; 22 tests green |
| C7  | Group-chat VN party join/leave                                                         | `TASK-travel-party-migration.md`             | ▲ now                           | 🟡 **Phase 1 done 2026-08-19** (worktree `feature-c7-group-chat-vn-party` `d163cbe1`) — `joinParty`/`leaveParty` service + VN narration + `guest` role; Phases 3-4 (split/reunite/choice-card) open |
| D1  | Assistant panel in chat sidebar                                                        | `../priority-p0-p2.md`                        | ▲ now                           | ✅ **DONE 2026-08-19** — dedicated `assistant-toggle` header button opens the unified panel on the Assistant tab (`openGmAssistantTab('assistant')`); browser e2e coverage in `group-chat-matrix.browser.ts` (commit `335e585a`) |
| D2  | Message actions UI (edit/delete/pin/react)                                             | `../priority-p0-p2.md`                        | ▲ now                           | ✅ **DONE 2026-08-18** — edit/delete/pin/react + flag + context menu on chat bubbles; backend `message-reactions.ts` + `chat-pins.ts` (`444bd8ba`, `0cb9dc97`) |
| E2  | GM-guided story (user-as-GM UI + doc) — **Gate C remainder**                           | `../priority-p0-p2.md`                       | ▲ now                           | ✅ **DONE 2026-08-14** — UI + persistence + orchestrator consumption (`4b0dd146` threads `gmGuidance` into `GameMasterService`; ticket `TASK-gm-guided-story-creation.md` ✅) |
| F3  | M6 AUX telemetry (tokens/latency per call)                                              | `../priority-release-010.md`                   | ▲ now                           | ✅ **CLOSED 2026-08-18** (worktree `feature-f3-aux-telemetry`) — `aux.call` telemetry events, `generation.completed` latencyMs fix, `GET /api/admin/telemetry/aux` endpoint, 5 AUX sites verified |
| G2  | World timeline §5.3 forward-event steering + §5.4 cross-story convergence              | `epic-world-timeline*` (cluster B)           | ▲ now                           |                       |
| G6  | Avatar-gallery visibility inheritance                                                  | `../priority-p0-p2.md`                        | ▲ now                           | ✅ DONE (2026-08-19) — private-character avatar assets gated to owner in gallery grid/search (asset_links -> actors.owner_id) |
| V1  | Emotion-avatar + asset-platform plan bundle (5 epics + matrix + P4 rows)              | `../matrix-emotion-avatar-assets.md`          | ✅ landed                        | merged to dev `0e8d4830` (2026-09-02); post-land bookkeeping pass ✅ executed 2026-09-02 (`plan-bookkeeping-2fa-emotion`) |
| X1  | 2FA channel-provisioning plan bundle (1 new epic + 2FA epic rewrite + AC-matrix + backlog rows) | `../matrix-authentication-channels.md`        | ▲ finalize when convenient      | ✅ merged `ad89fac4`–`7b4326a8` (2026-09-02); execution tickets F1–F10 created; matrix footer checklist partially open (human triage + [WAC1–4]) |
| W3  | **Push `dev` → `origin/dev`** (Gate C + item-systems + docs-reconcile + memory-selection UI + C1 panel + GM-guided story + 7 wired RPG services) | `dev` (unreleased) | ▲ before release | |
| C3  | Assistant tooling remainder — creation wizards + tiered `/commands` (tool-call display ✅) | `../priority-p0-p2.md`                     | ▲ now                           | ✅ **DONE 2026-08-18** — creation wizards (`/create` → prompt templates → quality gates → preview → confirm endpoint) + tiered command registry (`531664d5`, `81e5d1eb`, `19139461`) |
| D3  | Expand command buttons (GM role switching ✅)                                           | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial             |
| E1  | Unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12)                      | `../priority-p0-p2.md`                        | ▲ now                           | ✅ **CLOSED 2026-08-20** — unified 5-tab panel wired; `openGmAssistantTab` global registered; `showGmPanel`/`gmAssistantTab` in ui-store; header 🤖/📜/👥 buttons all call `openGmAssistantTab`; story-view/input-area 🎭 buttons now also call `openGmAssistantTab('shadow')` (parity fix, 2026-08-20). Tests: group-chat-matrix 3/3 + frontend 374/374 green. |
| H1  | Idempotency cache key lacks user scope — cross-user response replay (reopened 2026-09-01) | `BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r.md` | ▲ now | ✅ Resolved (2026-09-02) — wiring live in `src/elysia-app.ts` (user-scoped replay), cross-user isolation integration test restored (`60bcc1f8`); ticket marked resolved by `fix-idempotency-user-scope`. |
| H2  | account-tier custom instructions render as system message without injection preamble (GM override vector) | `BUG-account-tier-custom-instructions-render-as-system-message-wi.md` | ▲ now | ✅ Resolved (2026-09-02) — data-only `wrapUntrusted` shared with the custom-instructions section (`ba21d72d`) + obey-vs-data semantics reconciled (`30033b95`); ticket ✅. |
| H3  | dh-ratchet regression tests lack out-of-order delivery across ratchet boundary | `BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery-acros.md` | ▲ now | ✅ Resolved (2026-09-02) — out-of-order boundary scenario + independent KDF vectors landed (`1298df79`); ticket [OK]. |

| R1  | **Resource Provision** — new epic: external compute/inference endpoints, encrypted credential store (BYOK), browser backup opt-in with SHA-256 hashing, per-resource quota engine, hash-based reconciliation/recovery. 12 tickets scoped. | `.plan/epics/epic-resource-provision.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-resource-provision.md` and `.plan/tickets/TASK-resource-provision-*.md` |
| R2  | **Assistant Entity Access & Manipulation** — new epic: assistant access to RAG documents, assets, worlds, locations, characters, items, inventory; addition, modification, duplication, adaptation (outfit/knowledge/background for character in new world). 12 tickets scoped. | `.plan/epics/epic-assistant-entity-access.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-assistant-entity-access.md` and `.plan/tickets/TASK-assistant-entity-access-*.md` |

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
  - **P4**: ~~Lorebook activation (FEAT-055)~~ ✅ **DONE 2026-08-21** (lorebook-activation worktree: regex keys, key_groups, scan_depth, activation_chance, priority weighting; migration 050_lorebook_activation.ts; lore-activation.ts + lore.ts + lore.test.ts); Prompt library expansions (FEAT-065), Model capability registry (FEAT-067), Token budget advisor (FEAT-068), Conversation branching (FEAT-045–047)
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

- **2026-09-01 dev-fix review backlog (planning only)** — Three BUGs require
  action before next bugfix-batch: H1 (idempotency user-scope, HIGH),
  H2 (account-tier custom-instructions preamble, MED), H3 (dh-ratchet
  out-of-order tests, MED). See `.tmp/next-batch-2026-09-02-plan.md` for
  recommended tomorrow order and pre-work grep lists. Also: 6 stale
  `VALID_FIXED_WORKTREE` worktrees (`fix-character-avatar-idor`,
  `fix-character-xss-batch-doc`, `fix-chat-routes-batch`,
  `fix-command-dispatch-async-safety`, `fix-csrf-hardening-batch`,
  `fix-middleware-async-cancellation`) need a clean-or-drop call before
  piling new work on top.
