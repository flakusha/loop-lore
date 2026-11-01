<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

<!-- Historical archive — do not edit. Built from the .plan/backlog tier files before their deletion. -->

# Backlog archive (tier files dropped 2026-11-01)

The hand-maintained `.plan/backlog` tier format was dropped on 2026-11-01
(worktree `backlog-drop-tiers`). Tickets (`.plan/tickets/` + `index.json`) and
epics (`.plan/epics/` + `.plan/epics-index.md`) are the sole source of truth for
status and priority; the derived view is `.plan/priority-matrix.md`
(regenerate with `bun run plan:priority`). The `backlog - index` gate and the
`plan:backlog:sync` scripts were removed with the tier files.

This file preserves the historical content of all 13 tier files verbatim
(statuses below are stale by definition — they were hand-maintained and had
already drifted from the ticket index before the drop):

- [open-closed.md](#open-closedmd)
- [open-debt.md](#open-debtmd)
- [open-deferred.md](#open-deferredmd)
- [open-inflight.md](#open-inflightmd)
- [open-untriaged.md](#open-untriagedmd)
- [open.md](#openmd)
- [priority-p0-p2.md](#priority-p0-p2md)
- [priority-p3-p5.md](#priority-p3-p5md)
- [priority-p6.md](#priority-p6md)
- [priority-release-010.md](#priority-release-010md)
- [priority.md](#prioritymd)
- [recommendation-search-rag-capabilities-no-new-epic.md](#recommendation-search-rag-capabilities-no-new-epicmd)
- [security-review-2026-08-25.md](#security-review-2026-08-25md)
---

## open-closed.md

## Recent wiring (reference)

- **NSFW gate correctness cluster (closed 2026-08-27, commit `49731047`)** — six issues
  from the 2026-08-25 security-hardening wave (see `security-review-2026-08-25.md`) shipped
  on `dev` via the `fix-nsfw-gate-correctness` worktree: `ccb8879` (gate ordering — pre-LLM
  `checkNsfwEligibility` at `src/generation/auto-gen/auto-generation.ts:132`; `NsfwHook` is
  post-LLM defense-in-depth), `da08f1b` (fail-open → fail-closed on `getEffectiveNsfw`
  errors; `admin_emergency_block` audit + `suppressContent`), `f89168b` (group-chat
  weakest-link intersected across human participants in `src/middleware/nsfw-gate/consent.ts`),
  `4f8aeb2` (consent persisted to `nsfw_consent_state` migration 069, ledger in
  `consent-ledger.ts` replaces in-memory map), `9575d31` (`logNsfwEvent` exported and
  invoked from `NsfwHook.logGateDecision`; audit attribution = `context.userId`), `94f9a36`
  (`overrides.ts` PUT routes gain `checkChatAccess` guards). Rows removed from
  `open-untriaged.md` Security-hardening wave table.
- **SSE refactor (merged `082c20cf`)** — `sse-utils.ts` extracted from
  `stream-to-client.ts`; `src/generation/generate-route/sse-utils.ts`; chat.html stream
  markup simplified (2026-08-13/14, committed on `dev`).
- **Item-systems unification backend 10/15 (merged 2026-08-14, `rpg-wire-routes`)** — single item
  taxonomy, NPC inventory → `world_items.owner_actor_id`, actor items (equip/carry/
  transfer), world items → equipment, loot persisted as world items, item-transfer event
  handler, crafting recipe CRUD, currency ledger + atomic two-sided trade, module splits
  under size gate (2026-08-12, 13 commits, merged to `dev`).
- **Gate C sub-items verified complete on `dev` (2026-08-12)** — register page
  (`/register` + `POST /api/auth/register`), prompt registry (`src/prompts/registry.ts`),
  GM panels (`chat/gm-panel.html`) + quest log (`/views/quests`), world/location access
  (`requireWorldAccess`/`requireWorldOwner` on all locations handlers), assistant
  tool-call UI (persisted `messages.tool_calls` migration 037, rendered collapsible
  blocks, live `tool_call` SSE). Worktree: `p2g-gate-c`.
- **Size-strict debt closed (2026-08-12)** — `size:strict` reports 0 files over 250L.
- **Docs reconciliation (merged 2026-08-14, `docs-reconcile`)** — docs nav link in sidebar
  (`{{docsNav}}` gated on `DOCS_ENABLED`, 10 locales), 2 dead vitepress sidebar links
  fixed, 5 new guide pages (first-chat, personas, worlds, gallery, settings) +
  rewritten getting-started; **3/4 tickets done** (fix-dangling-links, guide-how-tos,
  ui-endpoint-linkage), **1 in progress** (`TASK-docs-reconcile-implementation.md` —
  spec-vs-`src/` audit). Follow-on open: broken internal markdown links (link hygiene is
  owned by the `md:links` gate; the live queue is in `open.md` § Open / next actions).
- **AUX M5 ModerationHook safety** — shipped (2026-08-06): tokenized word-boundary
  matching, severity scoring, audit trail, non-destructive suppression.
- **Emotions** — EmotionHook emits canonical `EmotionType`; prompt `emotion` defaults +
  `detectAvatarChangeIntent` wired (2026-08-06).
- **401-guard unification** — migrated to canonical `requireUserId` (`c99704c1`).
- **Telemetry** — transport gate + `trackTelemetry()` + deduped page_view (2026-08-06).
- **World channels & invite-driven membership** — epic completed + recorded (2026-08-06).
- **Multi-instance reconciliation spec** — expanded `docs/spec/multi-instance-reconciliation.md` (2026-08-07).
- **`.plan/` root cleanup + backlog consolidation** — two-file backlog (`open.md` +
  `priority.md`) established (2026-08-07/08).
- **Knowledge Systems (2026-08-01)** — lore audience scoping + per-viewer memory injection:
  - `src/assistant/lore/audience.ts` — pure `isLoreVisibleTo()` / `parseLoreScope()`, `ActorIdentity`, `LoreSubject` taxonomy (world/location/profession/race/faction/item); `loreSection` identity + pre-filter; spec `docs/spec/lore.md` reconciled
  - `memorySection` per-viewer memory injection — each participant provisioned against the speaker as viewer; combined 1024-token budget, per-actor cap (shipped 2026-08-01)

## Security & access — closed on dev (verified 2026-08-07 + 2026-08-12)

> The 2026-08-06 audit round 3 auth gaps were fixed on branch `auth-access-fixes`
> (commits `8f2a6d71` + `73cda7b9`) and **landed on `dev`** under new hashes:
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining access gaps) + `c99704c1`
> (401-guard unification → canonical `requireUserId`). World/location access checks
> (formerly "SKIPPED 2026-08-06 — merge-risk") were **verified enforced 2026-08-12** on
> all locations handlers. All rows below are **closed on dev**.

| # | Item                                                                                                          | Where                              | Status                                                                        |
| - | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| 1 | `message-encryption.ts` returns AES-GCM key without auth — chat access bypass                                | `src/routes/message-encryption.ts` | ✅ Closed (`requireUserId`+`checkChatAccess`)                                 |
| 2 | `nsfw-moderation.ts` trusts `x-user-id` header — spoofable identity                                          | `src/routes/nsfw-moderation.ts`    | ✅ Closed (`requireUserId`+`requireAdmin`/`requireOwnOrAdmin`)                |
| 3 | `worlds.ts` allows any authed user to mutate public worlds                                                   | `src/routes/worlds.ts`             | ✅ Closed (`requireWorldOwner` on all 6 mutations)                            |
| 4 | `nsfw.ts` — no auth/ownership on NSFW data                                                                   | `src/routes/nsfw.ts`               | ✅ Closed (`requireUserId` on all handlers)                                   |
| 5 | Access gaps: chat-pins, chat-search join, vn-generate, character-emotions, chats export/participants, assets | across `src/routes/`               | ✅ Closed (`c78e5466`)                                                        |
| 6 | World/location access checks                                                                                 | worlds/locations                   | ✅ Closed — enforced on all locations handlers (verified 2026-08-12)          |
| 7 | `rpg.ts` POST endpoints missing body validation                                                              | `src/routes/rpg/` (dir)            | ✅ Resolved — file split; all 6 POST endpoints validate (verified 2026-08-08) |
| 8 | Duplicate export endpoint (`chats.ts` vs `chat-export.ts`)                                                   | `src/routes/`                      | ✅ Resolved — distinct endpoints (verified 2026-08-08)                        |

## Resolved (moved off)

- Gate C tool-call UI + register page + prompt registry + GM panels + quest log +
  world/location access — verified shipped on `dev` (2026-08-12).
- Size-strict debt — closed (2026-08-12, 0 files over 250L).
- `chat.html` malformed partial + `compress.ts` unguarded `.zst` read — fixed (2026-08-12).
- Item-systems unification backend subset (10/15) — landed in worktree `rpg-wire-routes`
  (2026-08-12), **merged to `dev` 2026-08-14** (row W1 resolved).
- memorySection cross-actor integration test — shipped (`memories.test.ts`).
- M5 ModerationHook safety — shipped (2026-08-06).
- GM role runtime effect — landed in `dev` (auto-gen branches prompt on `assistantRole`).
- Remove dead rule `detectIntent` — Removed 2026-08-07 (superseded by LLM `classifyIntent`).
- Duplicate-export / auth-bypass claims — verified on `dev` (Security section, 2026-08-08).
- Achievements/playthroughs/meta_progression tables — migration `035` landed (Schema §1).
- `dice_roll_history` index — migration `035` landed (Schema §2).
- `rpg.ts` POST body-validation claim — stale; all 6 `/api/rpg` POSTs validate (Security §7).

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.**

## Bucket A close-out — Security / Perf / Tooling (2026-09-03)

**33 commits landed on `dev`** (commit `f37056eb`): 20 security + 6 perf + 7 tooling.
This section is the cluster summary; the full per-commit list lives in the git log
(`git log --oneline 6c55ed8c..f37056eb`) and in the `## Resolution` blocks of the
follow-up tickets.

### Security cluster (20 commits)

- **Idempotency user-scope** (`c1cd4d8b`) — `src/middleware/idempotency.ts` cache key
  includes `userId`; cross-user response replay IDOR fixed. Regression test:
  `60bcc1f8 test(middleware): restore cross-user isolation integration test`.
- **HSTS** (`d789df42`) — `Strict-Transport-Security` emitted on HTTPS only, configurable
  `maxAge`/`preload`/`subDomains`.
- **CSRF double-submit** (`ccac5b9d`) — requires both cookie + header token; logout
  gated; `NODE_ENV`-aware `Secure` flag. Frontend injection via `b085c0ec`
  (htmx `configRequest` + `X-CSRF-Token`).
- **NSFW resolveFlagBody** (`9b39670d`) — status enum aligned with service `NsfwRecordStatus`
  (was `upheld` string, service expects union).
- **NSFW resolveReporterHashSecret** (`f4e49335`) — exported + production-gate tests
  for hash secret rotation.
- **Auth user-status gate** (`c9ca8edd`) — `resolveUserIdFromRequest` rejects users
  with `status !== 'active'`.
- **Session token** — `/api/auth/me` no longer falls back to unsigned JWT decode
  (`e16fb61` from security review, addressed in `c093f56d`).
- **401-guard unification** — `requireUserId` canonical handler (follow-up to `c99704c1`).

### Perf cluster (6 commits)

- **Check runner** (`f2deabc5`) — parallel runner capped at 4 jobs to bound peak RSS.
- **Crypto** (`11a6c0dd`) — `Bun.CryptoHasher` adopted for sha256 (replaces
  `src/crypto/hasher.ts` naive impl).
- **Transport** (`59a0753e`) — `Bun.gzipSync`/`gunzipSync` adopted.
- **Config portability** (`c77aa744`) — `${DATA_DIR}` placeholders in schema output
  instead of resolved absolute paths (`2f5c5f17`).
- **Config schema** (`2f5c5f17`) — top-level sections added to JSON schema emitter.
- **Tooling fix** (`3f640da9`) — knip/jscpd scripts repaired, stale dead-code config pruned.

### Tooling cluster (7 commits)

- **GPG pre-flight** (`8b3656db`) — `assertGpgUnlocked` on every signing path;
  pre-flight in check runner.
- **GPG keygrip** (`e0121860`) — `.credentials.env` `AGENT_GPG_KEY_ID` parsed for precheck.
- **Worktree finalize race** (`d13f6078`) — concurrent-merge guard prevents blind stash
  round-trip.
- **Reap stale propagation** (`7aa33f8b`) — finalize lock acquisition no longer deadlocks.
- **SPDX headers** (`3d1737c0`) — worktree-cli ticket files get SPDX headers.
- **detectHallucinations** (`d5e3a72e`) — wrapped in try/catch so DB error doesn't strand
  stored message.
- **Auto-gen catch path** (`7cbcea68` + `e2f086e5`) — `triggerAutoGeneration` `.catch()`
  path gains DI override + buffer stubs + `signalError` assertion.

### Audit follow-up tickets (8)

Filed as `TASK-audit-follow-up-*` git issues. No BLOCKING issues found; all were
NIT-1/LOW/MED follow-ups. ✅ Resolved 2026-09-10 (see § Retired 2026-09-18).

## Retired 2026-09-18 (cluster cleanup)

- **Build integrity cluster** — 3 BUG tickets (Bucket X) flipped ✅ Resolved on `dev`
  via commits `4a1f56b8` and `1cddba36`. Resolution blocks live on the four tickets
  (`BUG-routes-commands-index-ts-19-has-unused-import-t`,
  `BUG-register-plugins-150-references-undefined-chatsectionsroutes`,
  `BUG-post-store-test-ts-32-imports-missing-completegenerationopts`,
  `BUG-plan-sync-fix-mass-creates-orphan-git-issues-for-placeholder`).
- **Audit follow-up cluster** — 8 follow-up tickets ✅ Resolved 2026-09-10 in worktree
  `audit-followups-2026-09-10`. See the `audit-followups-2026-09-10` worktree log for
  commit refs.
- **Refactor cluster (Post-bug-bucket refactoring session-2026-09-03)** — 4 refactor
  tickets ✅ Resolved on `dev`: `resolveActorAccess`, `worldScoped`,
  `upsertByUnique`/`upsertByUniqueWith`/`insertUnique`, and
  `assertChatViewShape` (+ audit pass). 5th refactor
  `TASK-refactor-llm-provider-adapters-onto-shared-base-factory` is ⬜ Not Started
  (carried forward, not part of this retirement).

## Pruned 2026-09-26 (backlog doc cleanup)

Four backlog documents were deleted as no longer relevant. Their resolution evidence
stays reachable through this file, the per-ticket `## Resolution` blocks, and the
git log:

| Deleted document | Evidence retained here / elsewhere |
| ---------------- | --------------------------------- |
| `open-build-integrity.md` | § Retired 2026-09-18 + the four Bucket X tickets under `.plan/tickets/` |
| `open-vn-settings-bugs.md` | Checked row in `priority-p3-p5.md` (P4) + ticket `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings` |
| `bucket-A-security-perf-close-out-2026-09-03.md` | § Bucket A close-out (above) + the commit list in the git log |
| `bucket-x-build-integrity-close-out-2026-09-03.md` | § Retired 2026-09-18 + the four Bucket X tickets |

---

## open-debt.md

## Dead / unwired code

| #  | Item                                                                                                                                                              | Where                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Transport WebSocket stack unwired (adapters are no-op stubs; no WS server)                                                                                         | `src/transport/`                                               | 🟡 WIRE → `TASK-transport-server-wiring`: measured 2026-09-26 — only 2 of the ~9 files are imported by production code (`peer-table.ts` by `src/federation/gossip.ts`, `negotiation-parsers.ts` by `src/middleware/dynamic-response.ts`); the `factory`/`upgrade`/`negotiation`/`compression`/`protocol.unified` chain is reachable only from itself + tests. Server serves via Bun native HTTP/1.1+TLS (`src/server/start.ts`). Keep, revisit when real-time chat ships |
| 2  | Music/SFX/Video generation stubs (no provider)                                                                                                                    | `src/assistant/commands/`                                      | 🟡 Implement provider or disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Migration hygiene — see § Closed clusters moved off

> The append-only policy is documented in `src/db/migrations/README.md`; the loader is
> `getMigrationFiles()` in `src/db/migrate.ts`. No open hygiene items: the duplicate-prefix
> gate asked for by the 2026-08-25 audit landed in `scripts/check-migration-ordering.ts`
> (fails on duplicate numeric prefixes) and runs as the `migrations - ordering` check gate.

## Release hardening (mirrors `../priority-release-010.md`; kept here for the open queue)

- ✅ **Lint-ts debt** → closed 2026-08-14 (worktree `lint-ts-debt`).
- 🟡 **Size-strict debt** → closed 2026-08-12, **since regressed by growth**; must be back under the ceiling before the tag. Open tickets: `TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci`.
- ✅ **e2e browser stabilization** → closed 2026-08-14 (worktree `e2e-stabilization`).
- 🟡 release-process + tag `v0.1.0` + changelog + push `dev`→`origin/dev` → `TASK-PLAN-RELEASE-V010` + `epic-release-010.md`. Tagging and pushing are human-only.

## Closed clusters moved off (2026-09-26 prune)

- **Post-bug-bucket refactoring (2026-09-03)** — all 5 rows resolved (`scopeByUserId`, crafting `world_id` helper, typed Kysely upsert-by-unique helpers, Alpine store field validation, trust-boundary audit pass) — `open-closed.md` § Retired 2026-09-18.
- **Audit follow-up cluster (Bucket A/B/C, 2026-09-03)** — 8 tickets resolved 2026-09-10 (`audit-followups-2026-09-10`) — `open-closed.md` § Retired 2026-09-18.
- **Schema drift / latent bugs** — all 8 rows closed (migrations 035 tables/index, `migrateChat` parent remap, chat-search schema key, `chat.html` partial, `.zst` guard, age-gate error leak, telemetry `chatId`) — evidence in the ticket `## Resolution` blocks.
- **Migration hygiene** — the `migrations/parts/` era is over: the tree is a single top-level `NNN_*.ts` series auto-discovered by `getMigrationFiles()`, and the append-only policy (never combine applied migrations; the filename is the `kysely_migration` identity) is documented in `src/db/migrations/README.md` and enforced by `assertMigrationsNotStale`.
- **2026-09-10 debt paydown** (NSFW structural, test health, coverage floors, mesh size-gate splits, P6-I plugin loader/registry/config-merge/event-bus/mount-points/tool-executor suites) — landed; see `open-closed.md`. Residual: bundled shipped-plugin sources are only covered via the loader e2e boot path (coverage-waiver tracking).

**Still open:** transport module + music/SFX/Video stubs (above), the size-strict ceiling, and the `0.1.0` tag/push (human-only).

---

## open-deferred.md

## Item-systems deferred follow-ups — ✅ CLOSED 2026-08-18

The IS1–IS7 deferrals (crafting stations/execution/orders, trade lifecycle, NPC trading,
trade history, combat equipment durability) all shipped in the A8 unwired close-out
(`49ee5c1a`, routes mounted in `src/app/register-plugins.ts`). History:
`open-closed.md` § Dead / unwired + `../open-debt.md`.

## Hardening / deferred clusters

> Row numbers are stable ids referenced from other docs (e.g. `matrix-authentication-channels.md`
> reconciles #7); gaps are retired rows, not missing work. Items owned by the active decision
> queue live in `open-inflight.md` (world-timeline steering = row G2, party Phases 3–4 = row C7)
> and are not duplicated here.

| # | Item                                                                                                                                                                         | Status                                                    |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 4 | External music linking UI                                                                                                                                                    | 🟡 Open                                                   |
| 6 | Authoring/creation ownership indicators                                                                                                                                      | 🟡 Open                                                   |
| 7 | MFA (TOTP) + `/api/sessions`                                                                                                                                                 | 🔄 Re-planned 2026-09-02 (`epic-auth-channel-provisioning.md` + `matrix-authentication-channels.md`); impl still P6+ until human triage                          |
| 8 | Plugin ecosystem / three-tier memory / artifact / ComfyUI / provider ecosystem / RAG / social hub / decentralization / impersonation / 3D views / model-comparison reactions | ⏸ Deferred P6+ (see `epics/`)                             |
| 9 | Pre-compiled hot binary modules (native perf: crypto, compression, image/ML inference; Bun FFI + JS fallback)                                                                | ⏸ Deferred P6+ — added 2026-08-15 (`matrix-precompiled-hot-binaries.md`; epic `epic-precompiled-hot-binaries.md` + `TASK-precompiled-hot-binaries.md`) |

> **2026-08-15 pull-forward:** matrix agentic addendum rates **G38 (proactive messaging),
> G39 (quiet hours), G40 (keyphrase recall) as 0.1.0 Quick Wins** — pulled from P6-E to
> `../priority-release-010.md` § 0.1.0 Quick Wins items 13–14 (`TASK-proactive-messaging`,
> `TASK-quiet-hours`, `TASK-keyphrase-recall`). Not deferred here.
>
> **Closed clusters dropped 2026-09-26** — the 2026-09-03 config-schema / DevEx bug cluster
> (`2d7a60c`, `8f17329`, `94675a8`, `508a7ea`; all landed or resolved on their tickets) and
> the 8-ticket audit follow-up cluster (resolved 2026-09-10). Open size-gate work lives in
> `TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci` and
> `../priority-release-010.md`.

---

## open-inflight.md

## In-flight / decision queue — rows needing a finalize-vs-defer call

> Rule: when a row is decided, finalize means checking it off in the matching
> `../priority-*.md` tier and removing it here; defer means moving it to
> `open-deferred.md`. Rows already shipped, and rows that only mirror a
> `../priority-*.md` tier, are removed. This file is pruned on every backlog pass —
> if a row is neither open here nor in a tier file nor deferred, it is lost.
>
> **Pruned 2026-09-26.** Removed shipped rows: A5, A7, A8, B8, B10, C1, C2, C3, C4, C6,
> D1, D2, E1, E2, F3, G6, V1, X1, H1, H2, H3. W3 folded into A9 (same human-only push).
> Dated next-actions sections retired to `open-closed.md`.

| ID  | Item                                                                                    | Ticket / where                               | Recommend                       | Decision              |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- |
| A9  | Release artifacts (release-process, changelog) + push `dev`→`origin/dev`                | `../priority-release-010.md`              | ▲ now                           | 🟡 `docs/meta/release-process.md` + `CHANGELOG.md` done 2026-08-15; **tag v0.1.0 deliberately NOT created — post-testing human decision, never agent-side**; **push pending: pre-push hook blocks agent, human must push** |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                               | `../priority-p3-p5.md`                          | ▲ now                           | 🟡 Anthropic + Ollama native providers shipped 2026-08-17 (`chat-matrix-ui-remainder`); Bedrock deferred (AWS SigV4 scope) |
| C7  | Group-chat VN party join/leave                                                         | `TASK-travel-party-migration.md`             | ▲ now                           | 🟡 **Phase 1 done 2026-08-19** (worktree `feature-c7-group-chat-vn-party` `d163cbe1`) — `joinParty`/`leaveParty` service + VN narration + `guest` role; Phases 3-4 (split/reunite/choice-card) open |
| G2  | World timeline forward-event steering + cross-story convergence              | `TASK-timeline-branching-ui.md`           | ▲ now                           | 🟡 **Service layer DONE 2026-09-10** (worktree `g2-timeline-steering`) — `world_event_steerings` table (now in `src/db/migrations/001_init.ts`) + `src/story/timeline/event-steering.ts` (create/roll/resolve/list, red-herring guard) + `getConvergentEvents`; 12 tests. OPEN: branching UI + `loreSection` injection |
| D3  | GM config type authoring (human/hybrid) + any further palette verbs           | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial — palette hydrates from the live registry and the text tools (improve / rewrite / translate / summarize) ship as command buttons; what is still open is the human/hybrid GM-config authoring mode |

| R1  | **Resource Provision** — new epic: external compute/inference endpoints, encrypted credential store (BYOK), browser backup opt-in with SHA-256 hashing, per-resource quota engine, hash-based reconciliation/recovery. 12 tickets scoped. | `.plan/epics/epic-resource-provision.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-resource-provision.md` and `.plan/tickets/TASK-resource-provision-*.md` |
| R2  | **Assistant Entity Access & Manipulation** — new epic: assistant access to RAG documents, assets, worlds, locations, characters, items, inventory; addition, modification, duplication, adaptation (outfit/knowledge/background for character in new world). 12 tickets scoped. | `.plan/epics/epic-assistant-entity-access.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-assistant-entity-access.md` and `.plan/tickets/TASK-assistant-entity-access-*.md` |
| X2  | Refactor LLM provider adapters onto a shared base/factory (cross-cloned `index.ts` / `http.ts` in `src/generation/providers/{anthropic,ollama-native,openai-compatible}`) | `TASK-refactor-llm-provider-adapters-onto-shared-base-factory.md` | ▲ schedule with provider work | ⬜ open — re-homed here 2026-09-26; it was orphaned when the 2026-09-03 refactor cluster was retired. Coordinate with the federation/swarm provider tickets so they land on the new shape |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · G3 (external music
linking) · G4 (authoring ownership indicators) — see `open-deferred.md`.

> **Dated history removed 2026-09-26** — the per-date next-actions sections (2026-08-15,
> 2026-08-16, 2026-09-01/02/03, 2026-09-10) are gone; their content lives in
> `open-closed.md`, the `../priority-*.md` tiers, and the ticket resolution blocks.

## 2026-09-11 core-finalization wave

> Scope: finish + iron out core application features for 0.1.0. Proposal-tier
> items (FEAT-059/060/062/065/066/067/075/045-047, embeddings, asset-consistency,
> keyphrase recall, encounter gen, emotion-avatar/wardrobe/asset-platform proposals,
> 2FA execution, R1/R2 draft epics, API versioning) stay parked — not this wave.

### F1 — wiring remainders (small, ticket-backed)

- ~~`TASK-sessions-api-routes`~~ ✅ Done — ticket Status Done 2026-09-11; `src/routes/sessions.ts` + `src/routes/sessions-switch.ts` + `sessions.test.ts` on `dev`; Settings Sessions management UI rides un-finalized `feat-multi-session-ui`
- `PERF-gallery-uploadChatAssets-sequential` — ✅ Done 2026-09-19 (already parallel via `Promise.allSettled`; 3 regression tests on dev)
- World/location search (P3 filtering row remainder)
- Detailed tuning frontend (P3 #13 remainder) — ✅ Done 2026-10-01 (settings modal inputs + component state → `buildGmConfig` → `gm_config.assistantTuning`; backend resolves via `parseAssistantTuning` in `generate-route/handler.ts` and `resolveAutoGenSamplingParams` in `auto-gen/call-llm.ts`, beating the 0.9/2048 defaults and the short-reply heuristic)

### F2 — feature remainders (medium, ticket-backed)

- C7 Phases 3–4 — party split/reunite engine + VN choice-card integration
  (`TASK-chat-branch-merge.md`, child of `TASK-travel-party-migration.md`)
- G2 remainder — timeline branching UI + `loreSection` injection
  (service layer shipped 2026-09-10; `TASK-timeline-branching-ui.md`)
- E2E gaps — `TEST-e2e-users-personas-routes-missing` ✅ closed: `tests/e2e/flows/users.test.ts` + `personas.test.ts` on `dev`. `TEST-e2e-nsfw-moderation-routes-missing` ✅ closed for block/ban/shadow/flags (`tests/e2e/flows/nsfw.test.ts` covers the moderation HTTP surface; appeals/audit admin routes not asserted there — residual gap, refile if wanted). `TEST-e2e-auth-flows-missing` 🟡 stale-with-caveat: login/logout covered (`auth.test.ts` + `auth-session.browser.ts`) but generic token-expiry is only exercised on the export route (`export-auth.test.ts:197`) — keep open narrowed to token-expiry/general-routes.

### Hygiene closed in this wave (planning only, no code)

- P2-Reconcile ✅ all 9 closed (statuses verified on dev)
- Audit Follow-up Cluster ✅ all 8 closed (resolves the 2026-09-03 open listing above)
- Status corrections: command palette ✅, LoRA ✅, fine-tuning UI ✅ (B10),
  unified GM↔assistant view ✅ (E1), creation wizards ✅ (C3), md links ✅,
  memory-selection UI shipped, VN-settings cluster resolved
- `plan:sync:fix` re-run to backfill done-statuses into `tickets/index.json`
  (e.g. palette WIRE verified-done but unindexed)

### Still blocking the 0.1.0 tag

- **A9** — tag v0.1.0 + push `dev`→`origin/dev` (human-only: tags + push reserved for human)
- **Size-strict ceiling** — regressed since the 2026-08-12 close-out; must be back under ceiling before A9 (`TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci`)

Build Integrity Cluster closed 2026-09-03 (Bucket X, `4a1f56b8` + `1cddba36`) — no longer a blocker.

---

## open-untriaged.md

# Open — Untriaged Tickets & Issues (2026-09-11 — chat-epic filings + Sep-10 re-triage)

> **Purpose:** landing zone for git issues that exist but have no index entry / epic
> linkage yet (advisory orphans reported by `bun run plan:sync`; recompute the
> current set at triage time rather than trusting a captured count).
> Triage = link each issue to its epic/ticket (then `plan:sync --fix`), close as dup,
> or promote into a priority tier.

## Security-hardening wave (2026-08-25 review — see `security-review-2026-08-25.md`)

| Git issue | Topic | Suggested home |
| --------- | ----- | -------------- |
| `5842782` TASK-logging-hardening-minors-injection-rotation-races-sink-path | Logger injection/rotation races | logger hardening cluster (P6 candidate) |
| `a06b99e` BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids | Telemetry PII (raw bodies, session ids) | `security-review-2026-08-25.md` + privacy hardening |
| `b23b7fb` BUG-logger-censor-depth-cutoff-returns-subtree-untouched-nested | Censor depth cutoff bug | same cluster as logging hardening |
| `eafe79f` TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards | Regex pipeline lastIndex/caps hazards | regex hardening; relates to quick-wins item 4 (`transforms.ts`) |

## Date-handling correctness cluster (pairs with linked date-utils ticket)

The index already links `TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS`
to git issue `ad8bb7e` (unified date representation util). These open issues form the
surrounding date-handling correctness batch and should be triaged against that util work:

- `65c87b5` BUG-date-parse-results-unchecked-for-nan — unchecked `Date.parse` results
- `e72f484` BUG-untrusted-new-date-parse-without-invalid-date-guard — unguarded `new Date(parse(...))`
- `0c43ca5` BUG-server-view-date-display-ignores-user-timezone-locale — server-side display ignores user timezone/locale

## Federation / decentralization wave (concurrent, also unlinked)

An unlinked decentralization batch belongs to the decentralization epic family
(`epics/` — social hub / decentralization deferred cluster) and should get its own
epic linkage before any of that work starts. Beyond the generic items (ActivityPub
actor signing/rotation, WebFinger discovery, federated delete/GDPR, CRDT conflict
policy, delivery reliability queue, signal-bridge activation, Radicle integration AC,
leader/swarm arbitration, in-process federation test fixtures), these concrete open
issues surfaced in the same sync window:

- `81b59cf` BUG-activitypub-federation-does-not-leverage-the-blog-system-lem — ActivityPub should reuse the blog system (Lemmy/Mastodon primitive)
- `69d45a5` BUG-blog-comments-lack-threading-parent-comment-id-blocking-lem — comment threading blocks Lemmy/Mastodon/Reddit parity
- `476e62b` BUG-chat-im-adapter-abstraction-duplicated-protocoladapter-vs-so — ProtocolAdapter vs SocialAdapter duplication, no code path
- `27cc7ab` BUG-irc-integration-unscoped-as-group-chat-only-in-social-hub-ad — IRC integration scoped as group-chat-only in social-hub adapter list

## Known index defects

∅ none — the 2026-08-25 hash mismatch on
`TASK-CONSOLIDATE-UNSAFE-DATE-BUFFER-JSON-USAGE-INTO-SHARED-UTILS` was fixed (index
links `ad8bb7e`) and `bun run plan:sync` is green.

---

## 2026-09-10 re-triage

> `bun run plan:sync` is green except advisory orphans (recompute at triage time
> rather than trusting this snapshot). The Aug-25 waves above are linked reference —
> closed items moved to `open-closed.md` / `open-inflight.md` (§ 2026-09-03 sections).

### Current advisory orphans

- `e12566a` BUG-idempotency-table-backend — table backend became the default during
  Bucket A; verify the ticket still reproduces, else close. Suggested home: middleware
  hardening or close.
- `dd6158e` TASK-unified — placeholder scope; scope it to a real deliverable or close.

### Chat Variants Taxonomy + Chat Product Features wave (filed 2026-09-11 — **NEW**)

Two new epics with 27 tickets filed together on 2026-09-11. Tickets live on disk; epic spec + ticket files are linked, and both clusters now carry git issues (chat-variants 2026-10-22, chat-product-features 2026-10-02). Both cluster tables are already surfaced in `priority-p3-p5.md`:

- **`epic-chat-variants-taxonomy.md`** — taxonomy-only epic, 12 variants, **no schema migration**. Maps `(chat_type, chat_mode, chat_purpose)` onto existing columns (`max_turns`, `auto_advance`, `gm_config`, `talkativity`, `prompt_override`). Authority for "chat admin" = global admin OR creator OR owning gm. Status: 🟢 Shipped 2026-10-22 — the canonical table and the server pinning landed first; the real gap was reachability, and every variant is now selectable in the new-chat form.
  - 12 variant tickets: `TASK-chat-variant-{assistant,assistant-group,user-1x1,user-group,user-group-admin,llm-only,llm-only-group,llm-only-group-gm,character,character-group,rpg,rpg-group}.md`
  - **Suggested home:** `priority-p3-p5.md` Chat Variants Taxonomy cluster (already inserted 2026-09-11). The frontend variant picker and the create-chat payload validator shipped with the epic; the legacy-chat backfill stays open in that cluster.
- **`epic-chat-product-features.md`** — cross-cutting product feature coverage, 15 tickets. Status: 🟡 Not Started.
  - **P0-P2 promoted** (already inserted into `priority-p0-p2.md` 2026-09-11): `TASK-chat-feature-encryption-key-rotation.md` (app-critical — broken encryption blocks all private chats) and `TASK-chat-feature-ownership-transfer.md` (user-flagged new requirement).
  - **P3-P5 remainder** (already in `priority-p3-p5.md` Chat Product Features cluster): component-buttons (Medium), notes-shadow-carriage (Low), context-memory-events (Medium), turn-talkativity-skip (Medium), moderation (High), location-transition-transfer (Medium), archive-deletion-search (Low), introduction-generation-propagation (High), entry-field-pre-send (Low), rpg-rule-system (Low), settings-templates-compat-matrix (Medium), rpg-location-uniqueness (Low, RPG-gated), rpg-chronological-navigation (Low, RPG-gated).
  - **Suggested home:** `priority-p3-p5.md` Chat Product Features cluster + `priority-p0-p2.md` P0 table for encryption/ownership. Schedule order: encryption-key-rotation → ownership-transfer → moderation → introduction-generation → remaining in epic's published effort ranking.

**Triage status:** all 27 tickets were filed with realistic `src/` paths, acceptance criteria and related tickets, and both clusters are now linked to git issues — the 12 variant tickets closed with the epic on 2026-10-22, the 15 chat-product-features tickets on 2026-10-02.

### New clusters (open issues)

- **Mesh/federation interconnect** — `6bf6ddc` peer-config, `e23054f` instance-state
  advertisement, `2e34de8` observability config, `7c8cf4b` liveness/readiness,
  `8f695c2` prometheus metrics, `d6d3793` nodeinfo/well-known, `271e08d` SPKI pin
  verification, `035958e` DEK re-wrap, `41f4f83` content-clearance gate. Suggested home:
  mesh/federation epic family; schedule after encrypted-sharing lands (in flight —
  see `open-inflight.md`).
- **VN sprite staging** — `e99e21e` mood/action-driven staging, `5cf8b16` center/face
  anchor, `ea6d881` alpha matting, `2fba05b` speaker highlight, `9da9517`
  multi-character ordering, `9cac2d4` per-chat roster. Suggested home: P2-A VN follow-ups.
- **RPG mechanics opt-in** — `e98ab7f` per-mechanic config, `f2b98e3` gate chat commands
  behind world opt-in, `f26f456` /check breakdown, `6629f0d` actor-resolved checks,
  `d5506a5` unify roll RNG, `c29e560` level-up flow, `a8442ec` pure ability checks,
  `83e9718` world ruleset templates, `4c37f99` timed conditions, `baf7d71`
  history-committing chats, `1dd08b9` ruleset enforcement. Suggested home: P6 waves;
  land opt-in gating first (safety-relevant).
- **Coverage waivers + frontend batches** — `be72331` sub-floor waiver, `b4789c2` raise
  below-floor modules, `78c179f` alpine admin/npc/settings clusters, `55f201f` VN
  pages/new-chat/quests/worlds. Suggested home: release-010 hardening. **Decision
  (2026-10-22):** ~90% coverage is acceptable and no coverage baseline shift is
  needed — the per-module floor (`scripts/check/coverage.mjs`) and the test-gap
  baseline (`scripts/check/test-gaps-baseline.json`) stay as committed. These
  tickets are quality-of-life lifts, not a gate to unblock.
- **Item-generation discoverability** — `0d771c9` subcommand docs, `0f840fd`
  describe-preview-confirm UI, `b95bbff` review parity, `219124a` shared draft store.
  Suggested home: P2-C assistant tooling.
- **Workflow/GM routing** — FILED 2026-10-02 as `TASK-assistant-gm-handoff.md` (creation-chat handoff gap only; the other four scopes — sessions, mention strip, steering, runner reuse — already shipped, see `TASK-backlog-workflow-gm-routing-batch.md` table). Suggested home: P2-C/P2-D.
- **NSFW consent-surface follow-ups** — `d7c0253` consent gate wiring, `e0d7c5c`
  seduction preconditions, `e8f7a75` /api/nsfw authz. **CLOSED 2026-09-09** — all three
  resolved by the `nsfw-consent-gate-wiring` commit set; ticket statuses are Done and git
  issues closed. No remaining open work.
- **Misc** — `89f26c8` demo-login e2e order dependence, `2d1a281` migration-parts never
  apply (pairs with `open-debt.md` migration hygiene), `9b837f9` RAG captcha resilience,
  `c667507` ticket-epic-link backfill, `c622d40` capability disclosure, `1bedeb1`
  assistant lorebook tools.

### Further steps (proposed order)

1. Triage the remaining advisory orphans (link or close).
2. Schedule the mesh/federation interconnect batch (content-sharing landed).
3. Below-floor modules per waiver tickets; then frontend batches.
4. RPG opt-in gating before new mechanics.
5. Item-gen discoverability + workflow batches per P2-C/D capacity.
6. Human triage: 2FA/channel provisioning scheduling, A9 tag + push.

---

## 2026-09-25 epic linkage review

This review covers the open/in-progress entries in the current advisory queue, not
completed historical tickets. The queue is intentionally not bulk-linked: a
missing `Epic` field is a bookkeeping defect only when the ticket has one clear
owner; cross-cutting and blocked work should keep its dependency visible.

### High-confidence attachments applied

| Git issue | Ticket | Epic | Basis |
| --- | --- | --- | --- |
| `1bedeb1` | `TASK-assistant-lorebook-tools` | `epic-assistant-entity-access` | Assistant read/write operations on world and actor lore; the ticket names the same feature area. |
| `c622d40` | `TASK-capability-disclosure-lore-ceiling` | `epic-lore-knowledge` | The ticket explicitly binds lore disclosure tiers to the lore knowledge system. |
| `eafe79f` | `TASK-regex-pipeline-hardening-sweep-input-caps-lastindex-hazards-` | `epic-code-quality` | Shared regex performance/state hazards are code-quality hardening; security follow-up remains explicit in the ticket. |

### Source already declares an epic; index advisory remains

These files already carry an `**Epic:**` field, so they need index-regeneration
follow-up rather than another editorial change:

- `78c179f` and `55f201f` → `epic-testing-qa`
- `0d771c9`, `0f840fd`, and `b95bbff` → `epic-entity-generation-workflows`
- `219124a` → `epic-conversation-branching`
- `be72331` and `b4789c2` → `epic-testing-qa`

The current `plan:sync:fix` pass updates status links but does not backfill these
body-level fields into `tickets/index.json`; do not hand-edit the generated index.

### Existing epic homes; no new epic needed

- The RPG opt-in cluster (`e98ab7f`, `f2b98e3`, `f26f456`, `6629f0d`,
  `d5506a5`, `c29e560`, `a8442ec`, `83e9718`, `4c37f99`, `baf7d71`,
  `1dd08b9`) belongs under existing `epic-mechanics-governance.md`, with the
  parent `epic-rpg-mechanics.md`; do not create `epic-rpg-mechanics-governance.md`.
- Workflow/GM routing (partially filed 2026-10-02 as `TASK-assistant-gm-handoff.md` for the creation-chat handoff gap; the other four scopes already shipped — see batch ticket below)
  belongs to existing `epic-workflow-engine.md` plus `epic-assistant-gm-flows.md`.
  The workflow engine already owns runner/session persistence; GM handoff and
  shadow-note steering stay with the assistant/GM epic.
- The mesh/federation interconnect entries already have explicit homes:
  `epic-federation-swarm-sync.md` for fediverse/swarm plumbing,
  `epic-mesh-federation-content-sharing.md` for encrypted sharing/quota, and
  `epic-certificate-and-tls-management.md` for peer TLS pinning. No duplicate
  epic is justified.
- `81b59cf` is a member of `epic-federation-swarm-sync.md`, but the epic marks
  G17 blocked by G15 (flat blog comments). Leave it unlinked until G15 closes;
  this is a dependency hold, not an epic gap.

### Hold or close

- `e12566a` — reproduce before linking; the backlog says the table backend is
  now the default, so close if the defect no longer exists.
- `dd6158e` — close the placeholder-scope ticket; it is not an initiative.
- `c667507` — keep unlinked as one-off bookkeeping, then close after the
  backfill/index cleanup is complete.

### Remaining legacy unbound sweep

The remaining unbound history spans old completed work and live items whose
index metadata is stale. Do not apply a keyword-only bulk link. Triage by domain:

- auth/security → `epic-auth-access`, `epic-security-sandboxing`, `epic-crypto`,
  `epic-api-validation-guardrails`;
- chat/assistant/workflow → `epic-chat-product-features`,
  `epic-chat-context-optimization`, `epic-assistant-gm-flows`,
  `epic-assistant-entity-access`, `epic-workflow-engine`;
- RPG → `epic-rpg-mechanics`, `epic-mechanics-governance`,
  `epic-rpg-progression`, `epic-battle-action-systems`;
- frontend/QA → `epic-frontend-component-architecture`,
  `epic-frontend-backend-integration`, `epic-frontend-admin`,
  `epic-testing-qa`;
- media/assets → `epic-assets-media-pipeline`, `epic-frontend-gallery`,
  `epic-video-generation`, `epic-ambient-music-sfx`;
- RAG/providers → `epic-rag-document-processing`, `epic-rag-ingestion`,
  `epic-rag-retrieval`, `epic-rag-context-sources`,
  `epic-provider-plugin-ecosystem`;
- plan/tooling → `epic-code-quality`, `epic-testing-qa`,
  `epic-unified-spec-framework`.

### Next triage order

1. Close or reproduce `e12566a` and `dd6158e`; do not attach them speculatively.
2. Regenerate/verify the index from ticket metadata without overwriting its
   generated shape.
3. Sweep the remaining unbound open items by domain, attaching only where the
   ticket scope names one existing epic.
4. Create a new epic only when a cluster has repeated tickets, one owner, and no
   existing epic boundary; the current review found no such missing initiative.

## 2026-10-28 creative-3D filing — E2 Phase A optional hardening-window row

> Filing note (plan branch `plan-creative-3d`): the 3D epic was rewritten in
> place (`epics/epic-3d-generation.md`). Its Phase A display foundations are
> independently valuable and unblocked by the rest of the cluster; this row is
> an optional additive candidate for the current release hardening window.
> Promote to a priority tier at triage time if picked up.

- [ ] **3D display foundations (E2 Phase A, optional)** — `AssetType.Model3D`
  with magic-byte detection, serve parity, poster renditions
  (`TASK-3d-asset-type-and-serving`), lazy-mounted model-viewer/splat viewer
  partials with device-tier gate + 2D poster fallback
  (`TASK-3d-frontend-viewer-lazy-mount`), `reconstruction_runs` job table +
  owner-scoped routes + flow control (`TASK-reconstruction-run-jobs`) —
  `epics/epic-3d-generation.md` | proposal

---

## open.md

# Open — Index (In-Flight, Debt, Unwired Code & Deferred)

> **Last updated:** 2026-09-26 (prune pass — retired cluster docs removed, resolved
> rows dropped from the open queues). This index holds the status header + file map;
> it was split out of a single monolith 2026-08-15. It covers what is **currently in
> flight / needing a decision / open debt / deferred (P6+)**. The priority ladder P0→P6+
> lives in `../priority.md` (index → tier files).
>
> **Pruned 2026-09-26** — four documents were removed as no longer relevant. Their
> resolution evidence lives in `open-closed.md`, in the per-ticket `## Resolution`
> blocks, and in the git log:
>
> | Removed | Why |
> | ------- | --- |
> | `open-build-integrity.md` | Retired pointer stub (2026-09-18); the cluster closed via Bucket X. |
> | `open-vn-settings-bugs.md` | All 7 issues resolved 2026-09-05; kept as a checked row in `priority-p3-p5.md`. |
> | `bucket-A-security-perf-close-out-2026-09-03.md` | Completed-work snapshot; duplicated by `open-closed.md` § Bucket A close-out. |
> | `bucket-x-build-integrity-close-out-2026-09-03.md` | Completed-work snapshot; duplicated by `open-closed.md` § Retired 2026-09-18. |
>
> **Context recovery note (2026-08-15):** the August refresh reflected (a) Gate C sub-items
> verified shipped on `dev` 2026-08-12, (b) **worktrees merged** — item-systems
> backend wiring (`rpg-wire-routes`), docs reconciliation (`docs-reconcile`),
> memory-selection UI (dev `5e62eea7`/`3d8ba302`), C1 group-chat participant panel
> (`7cd4a06b`), and recovered-features all landed on `dev`, (c) SSE refactor committed
> (`082c20cf`), (d) `dev` ahead of `origin/dev` (unreleased — push
> still pending; folded into row A9, push is human-only), (e) **A5 lint-ts + A7 e2e CLOSED 2026-08-14** in
> worktrees `lint-ts-debt` + `e2e-stabilization` (check gate green; browser e2e
> green ×2). **GM-guided story (P2-Da) DONE 2026-08-14** — merged to `dev`
> (`480434d6` UI, `3f85b74b` model config, `4b0dd146` orchestrator consumption).
> (f) **7 more RPG services wired (`51a7bc01`, 2026-08-14)** — achievements, skills,
> npc-navigation, replayability, world-location-traits, xp-loot, combat + quest
> engine consolidation (see `open-closed.md`).

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress (Gate C core shipped; NSFW async pipeline + consent/route-authz wiring landed; mesh encrypted-sharing landed; coverage lifts with raised waiver floors; test-isolation hardening green) · Regex ✅ · P3–P5 → 0.1.0 value
tiers (see `../priority.md`) · Gate C ✅ (complete — GM-guided story P2-Da done). **Sep-11: (+) 27 chat-variant + chat-feature tickets filed 2026-09-11 in `epic-chat-variants-taxonomy` + `epic-chat-product-features` — triage pending (see `open-untriaged.md`).**

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`open-inflight.md`](#open-inflightmd) | **In-flight / decision queue** — rows needing a finalize-vs-defer call (A9, C5, C7, D3, G2, X2) + draft-epic planning rows (R1, R2) + deferred pointers |
| [`open-debt.md`](#open-debtmd) | **Debt** — dead/unwired code, migration hygiene, release hardening, closed-cluster record |
| [`open-deferred.md`](#open-deferredmd) | **Deferred** — hardening / deferred clusters (stable row ids), pull-forward notes, dropped-cluster record |
| [`open-untriaged.md`](#open-untriagedmd) | **Untriaged** — re-triaged 2026-09-10: Aug-25 waves closed out, current advisory orphans + new cluster suggestions (mesh/federation, VN sprites, RPG opt-in, coverage waivers, item-gen) |
| [`open-closed.md`](#open-closedmd) | **Closed (reference)** — recent wiring log, security & access closed, resolved (moved off), preserved notes |
| [`security-review-2026-08-25.md`](#security-review-2026-08-25md) | **Security review plan** — auth/access surface findings (CRIT→LOW) + proposed fix tickets + next-review backlog (WS/RBAC/asset reviews done 2026-08-25) |

`../priority.md` holds the priority ladder P0→P6+ — see its index.

## Open / next actions (2026-09-26 prune)

- **Release blocker: A9** — tag `0.1.0` + push `dev`→`origin/dev` (both are human-only: agents never tag or push) — `open-inflight.md`.
- **Core-finalization remainder** — C7 Phases 3–4 (party split/reunite + VN choice cards), G2 branching UI, `/api/sessions`, e2e auth/NSFW/users gaps — `open-inflight.md` § 2026-09-11 wave.
- **Dead/unwired code** — transport module, music/SFX/Video stubs — `open-debt.md`.
- **Coverage** — below-floor modules tracked by waiver tickets + frontend coverage batches — `open-untriaged.md`. ~90% coverage is acceptable as-is (2026-10-22): no coverage baseline shift is needed.
- **Triage** — chat-variants + chat-product-features clusters (27 tickets filed 2026-09-11) awaiting epic linkage — `open-untriaged.md`.
- **Landed history** (mesh sharing, NSFW pipeline, coverage lifts, test isolation, audit clusters) lives in `open-closed.md`.

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.** Full detail: `open-closed.md`.

---

## priority-p0-p2.md

## P0 — Critical Path (Blocking)

| Area           | Item                                                                                                                                   | Effort | Status                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Data Integrity | Phase 1 — config guards (reject `sqlite` when `INSTANCE_COUNT > 1`, warn on network FS WAL, fix stale MySQL claim in architecture doc) | Low    | ✅ Complete (`src/config/load.ts`)                                                                                                    |
| NSFW           | Moderation Safety Infrastructure — gate, consent, audit, flagging                                                                      | Medium | ✅ Complete — runtime config + live enforcement + mood-shift + audit-log UI + consent display (2026-08-06)                            |
| Shared Schemas | Reputation, Consent, NSFW Content Rating (`src/schemas/`)                                                                              | Medium | ✅ Complete                                                                                                                           |
| Chat Crypto | `TASK-chat-feature-encryption-key-rotation.md` — reliable post-encrypt + deterministic key rotation on membership change (joined `epic-chat-product-features` 2026-09-11; app-critical — broken encryption blocks all private chats) | High | ✅ Done — all 9 ACs green (ticket Status Done; AC7 via `src/crypto/key-rotation/rotation-restart.test.ts`); implementation `src/crypto/key-rotation/` (`auto-run.ts`) + `src/routes/admin/key-rotation.ts` + cron job |
| Chat Ownership | `TASK-chat-feature-ownership-transfer.md` — owner can hand chat to another participant; mod/GM roles re-evaluated; audit handover (joined `epic-chat-product-features` 2026-09-11; user-flagged new requirement) | Medium | ✅ Done — ticket Status Done (all acceptance criteria green, verified 2026-10-01); owner transfer, mod/GM role re-evaluation and audit handover shipped; confirmation step + `confirm: true` on backend |

## P1 — High Priority (Post-P0)

| Epic               | Item                                                               | Effort | Status                      |
| ------------------ | ------------------------------------------------------------------ | ------ | --------------------------- |
| NSFW Integration   | Gaps — Housing, Weather, Social, Disease (G6–G9)                  | Medium | ⬜ Deferred → P6 (epic ⬜ Not Started; matrix P6+ deferred) |
| Battle Integration | Gaps — Items, Social, NPC, Weather, Resolution (G1–G5)           | High   | 🟡 In progress — G1–G5 shipped (`epic-battle-integration-gaps.md` Status In Progress); open: economy integration + battle-scoped UI exposure of social/item actions |
| Data Integrity     | Phase 2 — `data_version` optimistic concurrency, `409` on mismatch | Medium | ✅ Complete                 |

## P1.5 — Accessibility

- ✅ Complete as of 2026-07-31 (focus traps, aria-live, reduced-motion, contrast, touch).

## P2 — Core Workstream (Next Work)

> Emphasis: VN mode, chat, assistant, tool calling, GM flows, GM-guided story, auth/access,
> gallery, reconcile bugs (build-fix + security + broken features). RPG mechanics deferred to
> P2-later — **except the item-systems backend wiring which merged to `dev` 2026-08-14 from
> worktree `rpg-wire-routes`** (see P2-later row + `epic-rpg-wiring-phase3.md`).
> Detailed per-tier tickets live in `../tickets/`.

### P2-Reconcile — Reconcile Bugs (Build-fix + Security + Broken Features) — ✅ CLOSED

> Added 2026-08-21 from reconcile review (Scout Batch C). All 9 tickets resolved —
> statuses verified ✅ on `dev` 2026-09-11:
>
> - `BUG-impersonate-buildimpresult-referenceerror` — impersonation ReferenceError fixed
> - `BUG-impersonate-commands-register-empty-callback` — impersonate commands live
> - `BUG-npc-navigation-routes-all-stubbed` — NPC nav wired
> - `BUG-chat-swipe-index-race` — swipe race fixed
> - `WIRE-impersonate-command-palette-no-actionpayload-dispatch` — palette dispatch live
> - `WIRE-characters-create-avatar-linking-missing` — avatar linking wired
> - `WIRE-nsfw-audit-page-missing-inline-authz` — audit route guarded
> - `BUG-gallery-duplicate-serveGalleryGrid`,
>   `BUG-users-persona-handlers-horizontal-priv-esc`, `BUG-rpg-route-authz-gaps-*`
>   (closed 2026-08-22).
>

| Tier     | Topic                                 | Tickets                                                                                                                                                                               | Status                                                                                                                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-A     | Visual Novel Mode                     | `TASK-visual-novel-mode.md`, `TASK-vn-branching-choices.md`, `TASK-vn-dynamic-generation.md`, `TASK-vn-qa-mode.md`, `TASK-vn-scene-template-system.md`, `TASK-vn-template-actions.md` | ✅ Complete (backend + frontend, 2026-07-31); verify `bun test src/story/`                                                                                    |
| P2-B     | Chat System                           | `TASK-chat-*.md` (autorenaming, backgrounds, external-music, room-search-join, room-filters, message-search, sectioning, transfer-location, travel-party, AUX-*)                      | 🟡 In progress — shipped: autorenaming, room search/join, message search, section navigation, split/reunite + choice-card location actions (`TASK-travel-party-migration.md` Done, `TASK-chat-branch-merge.md` Done); party join/leave Phase 1 landed, VN renderer wiring open; transfer-location In Progress; open: `TASK-chat-backgrounds-location-sync.md`, `TASK-chat-room-filters.md`, `TASK-chat-sectioning-multi-location.md`, `TASK-chat-external-music-linking.md` (all Not Started), AUX enrichment partly In Progress, VN split/reunite visual effects, party roster/travel UI |
| P2-C     | Assistant & Tool Calling              | `TASK-assistant-commands-extension.md`, `TASK-assistant-command-execution-intent-detection.md`, `TASK-wire-gm-service-story-mode.md`, `TASK-assistant-gm-flows-reconciliation.md`     | 🟡 In progress — slash parser/commands, GM role runtime effect, LLM `classifyIntent`, **tool-call display ✅ (2026-08-12)**; creation wizards + tiered `/commands` ✅ (C3, 2026-08-18); palette↔registry drift ✅ closed (`WIRE-assistant-command-palette-stale-static-list`) |
| P2-D     | GM Flows                              | `TASK-gm-shadow-notes.md`, `TASK-gm-whitenotes.md`, `TASK-assistant-gm-flows.md`                                                                                                      | 🟡 **GM panels ✅ + quest log ✅ (2026-08-12)** + shadow/whitenotes shipped; unified GM↔assistant view ✅ (E1, 2026-08-20)                                                                                  |
| P2-Da    | GM-Guided Story Creation (user as GM) | `TASK-gm-guided-story-creation.md`                                                                                                                                                    | ✅ **Done 2026-08-14** — participant type, `/guide` + `/scene` commands, guidance panel, `PUT /api/v1/chats/:id/gm-guidance`, `gmGuidance` threaded into `GameMasterService` (`4b0dd146`); merged to `dev`                                                                                              |
| P2-E     | Authorization & Access                | `TASK-auth-register-route.md`, `TASK-encryption-access-management.md`, `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md`, `TASK-authoring-creation.md`   | 🟡 **In progress — backend auth/access shipped 2026-08-12**; MFA re-planned 2026-09-02 (`epic-auth-channel-provisioning.md`; scheduling = human triage); authoring ownership indicators open                       |
| P2-E†    | Unify 401 Guard Helpers (debt)        | `TASK-unify-401-guard-helpers.md`                                                                                                                                                     | ✅ Shipped 2026-08-06 (`c99704c1`) — remaining handler-funneled extraction tracked in `../open-inflight.md`                                                            |
| P2-F     | Gallery                               | `TASK-gallery-minimal-image-asset-viewer.md`, `TASK-config-gallery-attachment-idempotent.md`                                                                                          | ✅ Backend + frontend; avatar-gallery visibility inheritance complete (G6)                                                                                             |
| P2-G     | LoRA Discovery & Application          | `TASK-lora-discovery-application.md`                                                                                                                                                  | ✅ wired (A8, 2026-08-18; stale LoRA TODO dropped 2026-08-20)                                                                            |
| P2-later | RPG Mechanics (wire phase-3)          | `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`, `TASK-wire-*-routes.md` × 8, `TASK-consolidate-quest-engines.md`                 | 🟡 **Item-systems backend merged 2026-08-14 (`rpg-wire-routes`)** + **7 more services wired 2026-08-14 (`51a7bc01`)**: achievements, skills, npc-navigation, replayability, world-location-traits, xp-loot, combat; quest engines consolidated. Crafting/trade/battle execution also shipped (2026-08-18; epic records the wire tickets Done, though `TASK-complete-crafting-system-services.md` still reads Not Started). Remaining: item frontend/UX follow-ups — provisioning dashboard, NPC inventory UI, equipment stat preview, item generation, edit permissions & provenance (all ⬜ Not Started) → `epic-rpg-wiring-phase3.md` |
| P2-later | Character System                      | `TASK-character-system-p2.md`                                                                                                                                                         | ⏸ Deferred                                                                                                                                                    |
| P2-later | World & Locations                     | `epic-world-locations.md`                                                                                                                                                             | ⏸ Deferred                                                                                                                                                    |

### P2-A details — VN mode

Scene renderer, portrait manager, transition engine, typewriter, settings, CSS,
GmConfig VN fields, chat-settings UI, choice cards, QA mode, template engine +
scene/dialogue templates, transition triggers, dynamic story + choice generation,
image preloading — all shipped (`src/frontend/vn/` + `src/story/`). Open: gallery-in-scene
inheritance, `bun test src/story/` verification.

### P2-C details — Assistant & tool calling

- Slash command parser + 21 handlers wired (`messages.ts:543`, 2026-08-01).
- GM role switching UI shipped; runtime effect branches prompt on `assistantRole` (auto-gen).
- LLM `classifyIntent` wired (short-reply, 2026-08-05); rule `detectIntent` removed (see `../open-inflight.md`).
- **Tool-call UI shipped 2026-08-12** — `messages.tool_calls` persisted (migration 037),
  returned by read API, rendered as collapsible blocks, live via `tool_call` SSE.
- Command palette hydrates from the live registry (`GET /api/commands`) —
  `WIRE-assistant-command-palette-stale-static-list` ✅; text-tool verbs (improve /
  rewrite / translate / summarize) ship as command buttons
  (`src/frontend/alpine/chat-actions/command-buttons.ts`).
- Open: GM config type authoring (human/hybrid).

### P2-E details — Auth & access

- Auth routes + views: `src/routes/auth.ts` (login/register/demo-login/logout/me),
  `src/views/{login,register}.html`, `fe-fetch.ts` (CSRF + 401 redirect).
- Access: message + reaction gated via `checkChatAccess`; per-chat encryption key +
  key-mgmt UI + chat-list 🔒 badge; 401 guards unified (`requireUserId` canonical).
- **World/location access enforced 2026-08-12** — `requireWorldAccess`/`requireWorldOwner`
  on all locations handlers (stale "SKIPPED" claim from 2026-08-06 superseded).
- MFA (TOTP) deferred to P6+ (2026-08-05, local-only auth); **re-opened for planning 2026-09-02** — `epic-auth-channel-provisioning.md` + rewritten `epic-two-factor-auth.md` + `matrix-authentication-channels.md` (branch `plan-2fa-channel-integrations`); implementation scheduling remains human triage. `/api/sessions` shipped (`src/routes/sessions.ts` + `sessions-switch.ts`) with the Settings Sessions management UI (2026-10-30, `feat-multi-session-ui`).
- Open: authoring/creation ownership indicators.

---

## priority-p3-p5.md

## P3 — Core Foundation (0.1.0 value tiers)

> **0.1.0 scope = highest-value features.** P3→P5 follow this list; non-value work sits
> in P6+ (`../open-inflight.md`) unless it blocks these tiers. "P4/P5" workstreams below carry the
> **open remainder** of each P3 row (the status column is the summary; the P4/P5 sections
> list what still needs doing to close the row).
>
> **2026-08-21 reconcile additions** — 7 P3 tickets from Scout Batch C added below as rows 18-24.

| #  | Value feature                                           | Status                 | Where / next                                                                                                                                |
:| -- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | User registration                                       | 🟢 complete            | `POST /api/auth/register` ✅ + `/register` page ✅ (2026-08-12)                                                                             |
| 2  | User authentication                                     | 🟡 partial             | login/logout/demo-login/`/me` ✅; `/api/sessions` pending; MFA deferred P6+                                                                 |
| 3  | Correct access (chats/assets/worlds/locations)          | 🟢 core                | actor ownership; 401 guards unified; message/reaction checks ✅; **world/location access enforced ✅ (2026-08-12)**                          |
| 4  | Encryption + compression flow                           | ✅ wired               | browser AES-256-GCM; `pipeline.ts` messages + asset encrypt/decrypt; per-chat key + 🔒 badge (2026-08-06)                                   |
| 5  | Chats — all 9 types                                     | 🟡 P2-B                | autorenaming/sections/invites/filters/message-search/transfer ✅                                                                            |
| 6  | NSFW features, prompting, opt-in, sfw/nsfw caps         | 🟢 complete            | runtime config + enforcement ✅; audit-log UI + consent display ✅ (2026-08-06); character 5-tier rating UI open                            |
| 7  | Metadata extraction + captioning                        | 🟢 done                | regex pipeline + caption-route                                                                                                              |
| 8  | i18n                                                    | 🟢 done                | `ctx.t` + locales ✅; frontend strings + locale switcher ✅ (2026-08-06)                                                                    |
| 9  | Visual novel mode                                       | ✅ complete            | `src/frontend/vn/` + `src/story/`; gallery-in-scene inheritance open                                                                        |
| 10 | Gallery + (image) asset preview                         | ✅ complete          | `gallery.ts` + `assetRoutes` ✅; signed URLs ✅ (C6, `6b4e1ab4`) — download/copy/preview via HMAC-SHA256 signed URLs |
| 11 | User + admin panels, settings, fine-tuning              | 🟡 partial             | admin user mgmt ✅; fine-tuning UI + provider health ✅ (B10, 2026-08-20)                                                                                |
| 12 | (Side panels) without leaving chat                      | 🟡 partial             | chat-settings modal ✅; **in-chat asset preview + linkage ✅** (`FEAT-in-chat-asset-preview-linkage-side-panel`, issue `fef7e3b` closed 2026-08-19) — gallery-sidebar + media-preview-modal + `pendingAssets`→message attachments |
| 13 | Chat settings menus — templates, tuning                 | 🟡 partial             | setup-template selector ✅; prompt-template registry `src/prompts/registry.ts` ✅ (2026-08-12); detailed tuning frontend open                |
| 14 | Character/world/location flows                          | ✅ complete           | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world export (`worlds/:id/export`) ✅; location creation inline in `world-detail.html` ✅; location export bundled in world export ✅ (code-verified 2026-08-20) |
| 15 | LLM support (chat/captioning/intent/embeddings)         | 🟢 chat/caption/intent | providers ✅ (openai-compat + Anthropic + Ollama native 2026-08-17); `classifyIntent` wired; embeddings greenfield                                                                                 |
| 16 | Assistant creative tooling                              | 🟡 partial             | command buttons + parser ✅; **tool-call UI ✅ (2026-08-12)**; creation wizards + tiered `/commands` ✅ (C3, 2026-08-18)                                                     |
| 17 | Frontend fully wired                                    | 🟡 ongoing             | menus/modals/side-menus/docs — docs reconciliation **merged 2026-08-14** (`docs-reconcile`); md links ✅ fixed 2026-08-14 (`md:links` green)                            |
| 18 | **Command palette FE not wired to BE** (WIRE)           | ✅ Done                | `WIRE-assistant-command-palette-stale-static-list.md` — verified in-ticket (registry endpoint + palette hydration); index backfilled |
| 19 | **Creation wizard cross-talk** (BUG)                    | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-characters-creation-wizard-wizardid-unused.md` — `confirmWizard` ignores `wizardId`. Effort: Small |
| 20 | **Chat batch export N+1** (BUG)                         | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-batch-export-n-plus-one.md` — sequential per-message queries. Effort: Small |
| 21 | **Mention error silent swallow** (BUG)                  | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-mention-silent-error-swall.md` — persist/notify failures swallowed. Effort: Small |
| 22 | **Quiet hours boundary off-by-one** (BUG)               | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-chat-quiet-hours-boundary.md` — proactive timing edge case. Effort: Trivial |
| 23 | **Gallery onclick ReferenceError** (BUG)                | ✅ Done (bookkeeping 2026-09-03, no code change — already on dev) | `BUG-gallery-openAssetPreview-context-safety.md` — context safety when not top-level. Effort: Small |
| 24 | **Gallery uploads sequential** (PERF)                   | ✅ Done (bookkeeping 2026-09-19) | `PERF-gallery-uploadChatAssets-sequential.md` — already parallel via `Promise.allSettled`; 3 regression tests on dev |
| —  | IO: import/export (characters/worlds/locations/stories) | ✅ shipped             | char import (PNG/YAML/TOML/JSON/CHARX) ✅; char export (PNG/JSON/YAML/TOML) ✅; world import bundle ✅; world/loc/story export ✅; bulk ZIP export ✅ (code-verified 2026-08-20) |
| —  | Stop generation (chat/VN)                               | 🟢 shipped             | chat abort/cancel + VN in-scene stop overlay (2026-08-06)                                                                                   |
| —  | Notifications + center                                  | 🟢 shipped             | SSE + unread badge + center UI + per-type mute (2026-08-06)                                                                                 |
| —  | Filtering & search                                      | 🟡 partial             | chat room filters + message search ✅; world/location search pending                                                                        |
| —  | Memory injection (high priority)                        | 🟢 per-viewer ✅       | `memorySection` 1024-token budget (2026-08-01); cross-actor test shipped                                                                    |
| —  | Template injection (high priority)                      | 🟢 shipped             | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt`; registry impl `src/prompts/registry.ts` ✅ (2026-08-12); UX pending (P4)                     |

### Chat Variants Taxonomy cluster (filed 2026-09-11)

> Taxonomy-only epic — no schema migration. Twelve canonical chat variants map onto the existing `(chat_type, chat_mode, chat_purpose)` triple plus the auxiliary `max_turns`, `auto_advance`, `gm_config`, `talkativity`, `prompt_override` columns. Authority for "chat admin" = global admin OR creator OR owning gm.
> Spec: `../epics/epic-chat-variants-taxonomy.md`. Status: 🟢 Done — the twelve variants ship as the canonical table and every one is selectable in the new-chat form; the entry-point tab branching and the legacy-chat backfill remain as cross-cutting work below.

| Variant | Tickets | chat_type | chat_mode | chat_purpose | Where / next |
| --- | --- | --- | --- | --- | --- |
| 1. assistant chat | `TASK-chat-variant-assistant.md` | `direct` | `story` | `assistant` | User ↔ assistant; one user, one assistant; entry-point = Assistant tab |
| 2. assistant group chat | `TASK-chat-variant-assistant-group.md` | `group` | `story` | `assistant` | Multi-user collaborative prompt; `talkativity = 4` |
| 3. user chat (1×1) | `TASK-chat-variant-user-1x1.md` | `direct` | `story` | `social` | Encrypted, two-user |
| 4. user group chat | `TASK-chat-variant-user-group.md` | `group` | `story` | `social` | Classical encrypted group, public + private variants |
| 5. user group + admin/mod | `TASK-chat-variant-user-group-admin.md` | `group` | `story` | `social` | Social group with admin/mod scope; `gm_config.moderation` block |
| 6. llm-only chat | `TASK-chat-variant-llm-only.md` | `direct` | `battle` | `validation` | No humans; LLM ↔ LLM validation harness; `auto_advance = 1` |
| 7. llm-only group chat | `TASK-chat-variant-llm-only-group.md` | `group` | `battle` | `validation` | Multi-LLM sandboxes, tracking, prompt fuzzing |
| 8. llm-only group + gm | `TASK-chat-variant-llm-only-group-gm.md` | `group` | `story` | `guided` | GM-driven narrative; gm is an LLM (or LLM+user) |
| 9. chat with character | `TASK-chat-variant-character.md` | `direct` | `story` | `roleplay` | User + one LLM character; entry-point = Characters tab |
| 10. group chat (multi-character) | `TASK-chat-variant-character-group.md` | `group` | `story` | `roleplay` | Multi-user + multi-character; `gm_config.cast` block |
| 11. rpg chat | `TASK-chat-variant-rpg.md` | `direct` | `story` | `rpg` | Attached to a world, in a location, rules enforced |
| 12. rpg group chat | `TASK-chat-variant-rpg-group.md` | `group` | `battle` | `rpg` | Multi-user party, turn rules, world+location binding |

**Cross-cutting** (Medium — opened if/when needed): frontend variant picker — shipped (all twelve variants selectable); frontend variant picker entry-point branches (Characters/Assistant/Social/Sandbox tabs) — open; create-chat payload validator per variant (guard at `routes/chats/create`) — shipped; migration of legacy chats into the taxonomy — shipped (`TASK-chat-variant-legacy-backfill.md`, migration 085: conservative `chats.purpose` backfill — world-bound → `rpg`, world-less battle → `validation`, everything ambiguous stays NULL/unclassified).

### Chat Product Features cluster (filed 2026-09-11)

> Cross-cutting product feature coverage for the chat surface. 15 tickets span rich-message controls, encryption reliability, GM annotations, context/memory/event propagation, turn/talkativity, moderation, ownership transfer, location transition with party handoff, archive + search filtering, intro-based entity generation, pre-send buffer, RPG rules, settings templates + compat matrix, RPG location uniqueness, RPG chronological/tree nav. Items 14 & 15 (RPG-gated) require `epic-rpg-wiring-phase3` and `TASK-rpg-gate-chat-commands-behind-world-opt-in`.
> Spec: `../epics/epic-chat-product-features.md`. Status: 🟡 In Progress — 3/15 shipped (archive, entry-field, GM annotations partial).

#### P0-P2 visibility (app-critical — promoted to `priority-p0-p2.md`)

- [ ] `TASK-chat-feature-encryption-key-rotation.md` (High / High) — effective & reliable encryption + membership-triggered deterministic key rotation; idempotent across concurrent events; in-flight sends must observe post-rotation key. **Joined `priority-p0-p2.md` P0 row 2026-09-11**.
- [ ] `TASK-chat-feature-ownership-transfer.md` (High / Medium) — owner can hand chat to another participant; mod/GM grants re-evaluated; audit handover; `confirm: true` on backend. **Joined `priority-p0-p2.md` P0 row 2026-09-11**.

#### P3-P5 remainder

| # | Cluster | Tickets | Effort | Where / next |
|---|---------|---------|--------|--------------|
| 1 | Component & Message UX | `TASK-chat-feature-component-buttons.md` | Medium | message actions + asset picker host (`src/components/chat/`, `src/group-chat/mention-parser.ts`) |
| 2 | Crypto Reliability (extra) | (rotation covered above) | — | `src/crypto/key-rotation/re-encrypt.ts` rollback path; `src/middleware/idempotency.ts` overlap-debounce |
| 3 | GM Annotations | `TASK-chat-feature-notes-shadow-carriage.md` | 🟡 partial | annotations vertical slice ✅ (note/shadow/quest discriminator, TTL, route layer, `shadow_notes` persistence); carriage channel pending |
| 4 | Context / Memory / Event Propagation | `TASK-chat-feature-context-memory-events.md` | Medium | `src/chat/{context-window,context-stats,random-events}.ts`, `src/memory/injection/*`, `src/rag/search/orchestrator.ts` |
| 5 | Turn & Talkativity | `TASK-chat-feature-turn-talkativity-skip.md` | Medium | `src/turning/turn-manager/{selection,participants}.ts`, `src/turning/turn-strategies.ts` |
| 6 | Moderation | `TASK-chat-feature-moderation.md` | High | `src/chat/moderation.ts`, `src/middleware/nsfw-gate/{access,consent,logging}.ts`, `src/profanity/service.ts` |
| 7 | Ownership Transfer (extra) | (transfer covered above) | — | `src/chat/ownership.ts`, `src/chat/service/{chats,write}.ts` |
| 8 | Location Transition & Party Handoff | `TASK-chat-feature-location-transition-transfer.md` | Medium | `src/chat/transitions.ts`, `src/chat/service/{transitions,carry-location,party,party-narration,location-events}.ts` |
| 9 | Archive / Deletion / Search Filtering | `TASK-chat-feature-archive-deletion-search.md` | ✅ Done | archive/unarchive + hard-delete cascade + RAG quarantine + list filter + search priority all shipped on dev |
| 10 | Intro-Based Generation & Backpropagation | `TASK-chat-feature-introduction-generation-propagation.md` | High | `src/generation/auto-gen/{classify-intent,resolve-known-names}.ts`, `src/chat/hallucination-guard/detect.ts`, `src/memory/extraction.ts` |
| 11 | Entry Field Pre-Send Buffer | `TASK-chat-feature-entry-field-pre-send.md` | ✅ Done | `composer-pre-send.ts` shipped; ticket marked Done |
| 12 | RPG Rule System | `TASK-chat-feature-rpg-rule-system.md` | Low | `src/chat/service/party-narration.ts`, `src/generation/prompt-templates/{profiles,templates}.ts` |
| 13 | Settings Templates & Compat Matrix | `TASK-chat-feature-settings-templates-compat-matrix.md` | Medium | `src/chat/{setup-templates.test.ts,service/templates.ts,service/template-crud.ts,service/template-defaults.ts,service/vn-choices.ts,types/config.ts}` |
| 14 | RPG Location Uniqueness *(RPG-mode gated)* | `TASK-chat-feature-rpg-location-uniqueness.md` | Low | gated by `TASK-rpg-gate-chat-commands-behind-world-opt-in`; `src/chat/npc-movement/index.ts`, `src/chat/service/party.ts` |
| 15 | RPG Chronological / Tree Navigation *(RPG-mode gated)* | `TASK-chat-feature-rpg-chronological-navigation.md` | Low | gated by `epic-rpg-wiring-phase3`; `src/chat/service/{split,split-utils}.ts`, `src/chat/service/carry-history.ts`, `src/chat/transitions.ts` |

> Triage status (2026-09-11): all 15 tickets filed with realistic `src/` paths + acceptance criteria + open questions. **Triage pending** — see `open-untriaged.md`.

## P4 — Core Experience (open remainder of P3 rows)

**Creative-3D cluster (filed 2026-10-28, plan branch `plan-creative-3d`) — P3-P5 band:**

- [ ] **Asset generation metadata spine (E0a)** — self-describing generations: queue-time fact capture, shadow overrides, tiered import parser, camera/3D fact extensions, embedded regeneration manifests — `epic-asset-generation-metadata.md` (8 tickets) | proposal
- [ ] **Asset lineage provenance (E0b)** — generation chains over `assets.content_hash`: link kinds, lineage query/UI, provenance summaries, downstream-consumer propagation — `epic-asset-lineage-provenance.md` (5 tickets) | proposal
- [ ] **Contextual view-set & turnaround generation (E1)** — ordered per-view camera-facted image sets (edit-grid + ControlNet tiers now; orbit-video tier blocked until the video run seam lands), gallery set cards, assistant `view-set` template — `epic-view-set-generation.md` (7 tickets) | proposal

### Image/Video Scenario Studio cluster (filed 2026-10-28, plan branch `plan-ivss`) — P3-P5 band

> Sequencing: IVSS schema + CRUD + assembler + the converter ride the P3-P4 band with the creative-3D cluster; the video engine + run pipeline follow `epic-comfyui-first-class-citizen.md` Phase 2; browser editor tiers and DCC/bridge tiers run parallel; export profiles last (after lineage/licensing land). ComfyUI is the unified generation backend (2026-10-28 correction); sdcpp's disposition is decided (2026-10-29: opt-in lightweight fallback).

- [ ] **Image/Video Scenario Studio (IVSS)** — world-owned scenario documents (scenes/shots/references/docs), scene run pipeline over ComfyUI video workflows, browser editing tiers (timeline, mask painter, storyboard, miniPaint handoff), annotations + collaboration, world/location binding, dual-use export profiles — `epic-image-video-scenario-studio.md` (17 tickets) | proposal
- [ ] **Video generation engine tiers** — flow-tier workflow rows (Director first-class default tier per the 2026-10-29 decision, license terms recorded; Wan Apache-2.0 family alongside; LTX speed tier; post stages), per-workflow GPU probe gating, consent-gated BYOK Kling tier in scope (Veo later); the three filed video tickets fold into its phases — `epic-video-generation.md` (rewritten) | proposal
- [ ] **UI→API workflow converter** — generic ComfyUI UI-format → API-format converter (subgraph flattening, promoted-widget substitution), filed under the workflow-library epic with the Director workflow as fixture — `epic-comfyui-first-class-citizen.md` (1 ticket) | proposal
- [ ] **Workflow + bridge + reuse annex extensions** — `generation-video`/`generation-scenario` dispatch backends + payload-preview step type (`epic-workflow-engine.md`), melt/auto-editor/rawtherapee tiers (`epic-external-creative-tool-bridge.md`), video metadata extractor + from-asset i2v (`epic-multimodal-asset-reuse.md`) | proposal

**ComfyUI workflow-prep + capabilities cluster (filed 2026-10-30, plan branch `plan-comfy-capabilities`) — P3-P5 band:**

> Sequencing: the workflow-prep chain (converter → param-map derivation → probe scaffold → UI-format ingest) rides the workflow-library epic's Phase 6 and precedes the capability rows; the capability tickets depend on the probe scaffold + ingest landing first. ComfyUI is the unified generation backend; RES4LYF stays fenced out (settled gate); no ticket assumes weights not on disk — acquisition is in-AC with license/VRAM fences where missing.

- [ ] **ComfyUI workflow-prep pipeline** — offline UI→API conversion of saved workflow JSON, parameter-map derivation from marked workflows, generated acceptance probes (stubbed + live-probe stub, confirm-checklist row gates), and UI-format-first library ingest — `epic-comfyui-first-class-citizen.md` Phase 6 (4 tickets incl. the amended converter) | proposal
- [ ] **Installed-pack capability rows** — moss/anima family templates from operator fixtures, opt-in VAEDeGrid post-decode cleanup, face-detailer refinement tier (detector acquisition fenced), QwenVL in-graph prompt enhancer (boundary: not a second captioner), Krea moodboard style-conditioning rows — `epic-comfyui-first-class-citizen.md` (5 tickets) + one mask-painter seeding AC in `epic-image-video-scenario-studio.md` | proposal
- [ ] **Upstream ComfyUI memory-leak watchlist** — tracked OPEN set (#16150, comfy-aimdo #129/#130 follow-ups, #10475 glibc RSS retention, #14719 LTX freezes; PR#15456 + #11930 watch-rows) re-checked at every fork sync, with symptom tells, launch-flag escape hatches, and the `POST /free` caveat — `epic-comfyui-lifecycle.md` (1 ticket) | proposal

- [x] Memory + template injection UX — memory selection / pin UI ✅ shipped (verified 2026-08-16); per-chat prompt override ✅ shipped 2026-08-16 (`prompt_override`, migration 044)
- [x] Character/world/location flows — multi-format import, creation + settings menus ✅ (code-verified 2026-08-20; C4 closed in open-inflight.md)
- [x] Assistant tooling — creation wizards + `/commands` tiered access ✅ (C3, 2026-08-18); tool-call display ✅ 2026-08-12 (P3 #16 / P2-C)
- [x] LLM providers — Anthropic + Ollama native ✅ 2026-08-17 (`chat-matrix-ui-remainder`); ~Bedrock deferred (SigV4 scope)~ (P3 #15)
- [x] Assets — signed URLs (compression flow ✅ 2026-08-12) (P3 #10) — ✅ DONE (C6, `6b4e1ab4`)
- [x] Fine-tuning experience — provider health panel + fine-tuning UI ✅ (B10, 2026-08-20) (P3 #11)
- [x] NSFW — character 5-tier rating runtime enforcement ✅ (code-verified 2026-08-20; C2 closed in open-inflight.md)
- [ ] Chat UI — group chat matrix UI, unified GM↔assistant view (GM panels ✅ + quest log ✅ 2026-08-12; participant panel ✅ 2026-08-14; **turn-order indicator + side-channels ✅ 2026-08-16**; unified GM↔assistant view ✅ (E1, 2026-08-20); remainder = C7 Phases 3–4 + G2 branching UI) (P2-B/P2-D)
- [x] **Lorebook activation conditions** (`FEAT-055`) — regex keys, AND/OR key_groups, scan_depth, activation_chance, priority weighting — shipped 2026-08-21 via `lore-activation.ts` + `lore.ts` + migration `050_lorebook_activation.ts`; tests green ✅
- [ ] **Prompt library expanded — generation templates** (`FEAT-065` + sub-tickets) — image/audio/video prompt templates with parameter substitution, persistence, and per-provider adapters. Sub-systems: (`FEAT-065-sub-image`), (`FEAT-065-sub-audio`), (`FEAT-065-sub-video`), (`FEAT-065-sub-llm`). Spec: `FEAT-065-template-system.md`. |
- [ ] **Model capability registry** (`FEAT-067`) — per-model metadata (context length, function calling support, vision, pricing) auto-detected + editable. |
- [ ] **Resource Provision** — external compute/inference provisioning, encrypted credential supply (`src/crypto/byok.ts`), browser backup opt-in with SHA-256 hashing, per-resource quota enforcement, hash-based reconciliation/recovery. 12 tasks. Spec: `epic-resource-provision.md`.
- [ ] **Assistant Entity Access & Manipulation** — assistant access to RAG documents, assets, worlds, locations, characters, items, inventory; addition, modification, duplication, adaptation. 12 tasks. Spec: `epic-assistant-entity-access.md`. | proposal
- [x] **Token budget advisor** (`FEAT-068`) — ✅ done (real-time context-window usage meter + trim suggestions). |
- [ ] **Conversation branching** (`FEAT-045`, `FEAT-046`, `FEAT-047`) — branching data model (tree-structured chat with fork points), branch navigation API, and branch UI controls (fork/resume/compare). Builds on existing chat tree with `parent_id`. |
  - `TASK-branch-merge-db-migration-039.md` — merge-record schema
  - `TASK-branch-merge-service-and-criteria-engine.md` — merge service + mode engine
  - `TASK-branch-merges-routes-and-typebox-schemas.md` — HTTP surface
  - `TASK-branch-merge-frontend-wizard-ui.md` — merge wizard UI
  - `TASK-branch-merge-continuation-semantics.md` — synthetic branch + continue flow
  - `TASK-branch-merge-tests-and-coverage.md` — service, route and frontend tests
- [x] **Emotion-avatar pipeline completion** — binding render path (persist→read→per-message resolve), regeneration control (subset/slot re-roll + durable jobs) — design: `matrix-emotion-avatar-assets.md` AV1–AV3, `epic-emotion-avatar-message-binding.md` +2 | scope decomposed 2026-10-30 into tickets landed on `feat-emotion-avatar-completion`: `TASK-emotion-avatar-job-restart-reconciliation.md`, `TASK-emotion-avatar-regen-atomicity-and-subset-regression-tests.md`, `TASK-group-chat-per-actor-emotion-avatar-resolution.md`, `TASK-reroll-emotion-command.md`, `TEST-emotion-hook-to-avatarForMessage-integration.md` (context transforms + in-browser cropper remain open)
- [x] **VN mode settings exposure/access** — 7 interlocking bugs: visualNovel type mismatch (API Boolean vs DB Number), mode locked once chat has messages (in `KEY_MECHANIC_PARAMS`), redundant state (chats.visual_novel + gm_config.visualNovel), settings save blocks gmConfig for online chats, no Master/GM role restriction on settings change, 5 missing VN fields (imageScaling, autoAdvanceDelay, etc.), umbrella task `66c4c3d`. Umbrella ticket: `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings` (HIGH) — ✅ Resolved 2026-09-05 (`1b9b0cdf`, `5266f2cb`, `e14d3aaa`, `a16490a7`; cluster file pruned 2026-09-26, resolution lives on the ticket) |
- [ ] **Avatar alpha + VN sprite layering** — provider transparency capability, async matting fallback, `has_alpha` render branch, VN compositor layer — `epic-avatar-alpha-vn-layering.md` | proposal
- [ ] **Wardrobe/loadout avatar variants** — outfit axis × emotion, context-bound selection ladder, outfit-scoped regen — extends `TASK-character-multi-avatar`; `epic-wardrobe-avatar-variants.md` | proposal → ticket-backed (see `tickets/TASK-wardrobe-schema-wardrobe-items-actor-wardrobe-avatar-outfit-.md`, `TASK-wardrobe-selection-algorithm-v2-outfit-emotion-resolution-la.md`, `TASK-wardrobe-outfit-scoped-avatar-generation-batch-single.md`, `TASK-wardrobe-routes-validation-crud-outfit-override-endpoints.md`, `TASK-wardrobe-frontend-manager-on-character-sheet-outfit-switcher.md`, `TASK-wardrobe-story-gm-integration-outfit-change-events.md`, `TASK-wardrobe-tests-fallback-ladder-override-precedence-outfit-sc.md`, `TASK-wardrobe-deferred-equipped-items-outfit-auto-mapping-flag-ga.md`); config-schema `loadouts[]`/`outfits[]` shipped on `CharacterTemplate` + `configs/templates/character.example.{yaml,toml}` + `avatar.example.{yaml,toml}`
- [ ] **Asset platform capabilities B1–B5** — BLAKE3 dedup + renditions + EXIF strip; optimistic upload/albums/shared-media; GC + soft-delete + storage budget; caption/alt/pHash/backlinks (RAG feed); deterministic ops (assistant feed) — `epic-asset-platform-capabilities.md`; suggested order B1→B3→B2→B4→B5 | proposal
- [ ] **2FA channel provisioning** — verified-factor login/unlock across messenger (Matrix + bridges), e-mail, OIDC; factor state machine, unlock ladder, anti-takeover cooling-off — design: `epic-auth-channel-provisioning.md` F1–F10 + `matrix-authentication-channels.md` AC1–AC12; reopens the 2026-08-05 MFA deferral for planning | proposal (docs on `plan-2fa-channel-integrations`); security-relevant — human triage may promote above P4
- [x] ~~E2E NSFW moderation~~ (`TEST-e2e-nsfw-moderation-routes-missing`) — closed: `tests/e2e/flows/nsfw.test.ts` covers the moderation endpoint surface (block/ban/shadow/flags, role gating, 422s); caveat: appeals/audit admin routes not asserted there
- [ ] **E2E auth flows** (`TEST-e2e-auth-flows-missing`) — narrowed: login/logout covered (`auth.test.ts`, `auth-session.browser.ts`); generic token-expiry beyond the export route (`export-auth.test.ts:197`) still uncovered
- [x] ~~E2E users/personas~~ (`TEST-e2e-users-personas-routes-missing`) — closed: `tests/e2e/flows/users.test.ts` + `personas.test.ts` cover `/api/users/*` and `/api/personas/*`

## P5 — Wiring, Search & Polish (release-scoped)

- [x] IO (export/import) ✅; Stop generation ✅; Notification center ✅; chat message search ✅; swipe-variant ✅ (implemented + tested); GM role runtime effect ✅ (committed on `dev`)
- [ ] Frontend wiring — all menus/modals/side-menus/documentation linkage; in-chat asset preview + linkage; message actions UI (see P4/P2 tiers); **assistant panel ✅ 2026-08-19** (dedicated sidebar `assistant-toggle`, D1 in `../open-inflight.md`)
- [ ] **Implemented → wired** — LoRA routes ✅ wired (`register-plugins.ts:182`, `49ee5c1a`, 2026-08-18); SSE refactor ✅ (merged `082c20cf`, row W4 resolved in `../open-inflight.md`); remaining RPG services → `epic-rpg-wiring-phase3.md`; ~~dead `detectIntent`~~ ✅ removed (see `../open-inflight.md`)
- [ ] **Conversation analytics dashboard** (`FEAT-059`) — message counts, token usage over time, conversation length histograms, role distribution visualization. |
- [ ] **Model comparison A/B** (`FEAT-060`) — side-by-side comparison of model responses (multishot), quality rating, exportable comparison reports. |
- [ ] **Generation quality metrics** (`FEAT-062`) — per-generation scoring (latency, token efficiency, repetition rate) with trend charts. |
- [ ] **Lore-consistency checker** (`FEAT-066`) — AI-powered consistency validation across character descriptions, world lore, and memory entries. |
- [ ] **Memory access audit log** (`FEAT-075`) — who-pinned-what, decay timeline, source attribution — audit trail for memory operations. |
- [ ] **API versioning** (`FEAT-035`–`FEAT-044`) — version prefix routing, response envelope version, legacy redirect, deprecation headers, OpenAPI generation, schema versioning table, migration reconciliation, content versioning framework, migration testing + docs. (deferred from P6 — API governance epic; wire when API consumers stabilize) |
- [ ] **Unit test coverage** — 8 tickets from reconcile review (optional lifts: ~90% coverage is acceptable and no coverage baseline shift is needed, so none of these gate a landing):
  - `TEST-admin-seeddefaults-silent-duplicate-skip-untested` — seedDefaults idempotency
  - `TEST-characters-charx-roundtrip-untested` — charx extract→create round-trip
  - `TEST-gallery-frontend-utils-untested` — gallery chat-utils unit tests
  - `TEST-gallery-upload-dropzone-untested` — initDropZone + file validation
  - `TEST-npc-navigation-processMovementTick-untested` — NPC nav service
  - `TEST-nsfw-getflagqueue-status-filter-untested` — NSFW flag queue filter
  - `TEST-profanity-containsprofanity-edge-cases-untested` — profanity edge cases
  - `WIRE-extras-impersonateactorid-schema-validation` — verify ChatImpersonateBody schema |
- [x] **Build integrity cluster** — ✅ closed 2026-09-03 (Bucket X: `4a1f56b8` + `1cddba36`): the 3 untracked tsc errors and the `plan:sync --fix` orphan-issue bug are fixed; resolution blocks on the four tickets, history in `open-closed.md` § Retired 2026-09-18. No longer gating the tag.

---

## priority-p6.md

## P6 — Post-0.1.0 Systems (RPG, Memory, Agentic — deferred, non-blocking for 0.1.0)

> All gaps below are **P6+ deferred** under the 2026-08-05 0.1.0 alignment
> (matrix § 0.1.0 Alignment). None block P0–P5 / 0.1.0. G12–G17 are RESOLVED
> (excluded). G21–G23 are 0.1.0 Quick Wins (excluded). **G38–G40 pulled forward
> to 0.1.0 Quick Wins 2026-08-15** (matrix agentic addendum rates them
> "Quick win (0.1.0)") — see § 0.1.0 Quick Wins items 13–14. The two agentic
> TASK tickets formerly flagged "needs ticket" now exist:
> `TASK-character-internal-traits.md` + `TASK-memory-happiness-patterns.md` (created 2026-08-15).

| Wave | Topic | Gaps | Epic / Ticket | Status | Depends on |
| ---- | ----- | ---- | ------------- | ------ | ---------- |
| P6-0 | Resolution layer + Memory cross-system | G5, G24, G25, G26 | `epic-resolution-system.md` ⬜ (Integration Points ✅ 2026-08-15); G24 → `TASK-memory-emotion-impact` ✅; G25 → `TASK-memory-timescape` ✅; G26 → `TASK-timeline-id-world-timeline-events` + `TASK-timeline-memory-injection` ✅ | ⬜ Not Started | foundational |
| P6-A | Battle hub integration | G1 Items, G2 Social, G3 NPC/Actor, G4 Weather | `epic-battle-integration-gaps.md` ⬜ — doc-level RESOLVED 2026-08-15 (Battle Integration Points cover all 4; runtime wiring remains) | ⬜ runtime | P6-0 |
| P6-B | NSFW cross-links | G6 Housing, G7 Weather, G8 Social, G9 Disease | `epic-nsfw-integration-gaps.md` ⬜ — doc-level RESOLVED 2026-08-15 (NSFW Integration Points cover all 4; runtime wiring remains) | ⬜ runtime | P6-0 |
| P6-C | Remaining RPG gaps | G10 Housing↔Companion, G11 Crafting↔Magic | `epic-housing.md` / `epic-crafting-professions.md` — G10 doc-resolved 2026-08-15 (Companion covers Housing); G11 doc-resolved 2026-08-15 (Crafting deps incl. Magic + `magic.enchantment_applied` event — cross-system enchanting) | ⬜ runtime | P6-0 |
| P6-D | Character / Agentic core | G27,G28,G29,G30,G31,G32,G33,G34,G35,G36,G37 | `TASK-npc-bdi-planning`, `TASK-character-mood-happiness`, `TASK-npc-to-npc-social`, `TASK-character-relationships`, `TASK-memory-emotion-impact`, `TASK-agent-memory-scoring`, `TASK-living-world-persistence`, `TASK-character-voice-profile`, `TASK-character-growth-development`, `TASK-character-internal-traits` (new 2026-08-15), `TASK-memory-happiness-patterns` (new 2026-08-15) | ⬜ | P6-0 + char epics |
| P6-E | Agentic features addendum | G41 InnerMonologue, G42 Tool-Calling↔All (G38–G40 promoted to 0.1.0 Quick Wins 2026-08-15) | `TASK-inner-monologue`, `TASK-tool-calling-agents` (all ✅); G42 last (broadest) | ⬜ | P6-D + memory/assistant |
| P6-H | Pre-Compiled Hot Binary Modules | (standalone infra — `matrix-precompiled-hot-binaries.md`) | `epic-precompiled-hot-binaries.md` ⬜ + `TASK-precompiled-hot-binaries.md` ✅ — ModuleManifest contract, `binary.loaded`/`binary.fallback` events; added to backlog 2026-08-15 (was untracked) | ⬜ Not Started | foundational |
| P6-I | Plugin system (EventBus + ToolExecutor + UI mount + config merge) | FEAT-048, FEAT-049, FEAT-050, FEAT-051 | plugin EventBus wiring, ToolExecutor dispatch, UI mount points, config merge strategy. Deferred: no 0.1.0 user-facing contract | ⬜ Not Started | foundational |
| P6-J | CI/CD Pipeline | (infrastructure) | `epic-cicd-pipeline.md` ⬜ — build/test/lint gates, container/edge deploy. Deferred: manual deploy adequate for 0.1.0 | ⬜ Not Started | foundational |
| P6-F | Emergent cross-cutting (candidates 13–15) | G18 Agentic-NPC autonomy, G19 Agent-memory scoring, G20 Living-world persistence | fold into actor/npc + memory + world epics (no new epic) | ⬜ | P6-D / P6-0 |
| P6-G | Integration-template standardization | (rec #4) all 17 RPG epics use standardized `## Integration Points` template | — | ✅ 17/17 full-template 2026-08-15 (magic, companion, disease, social, weather, exploration, economy, stealth-crime, faction-reputation converted from bullet-style; charcore added — was missing) | any P6 wave |

**P6 sequencing rationale (severity → ROI):**
- 🔴 High first: G5 Resolution (foundational dice layer) + G1–G4 Battle hub (matrix rec #1, touches most systems) + G42 Tool-Calling (broadest, sequence last in P6-E once subsystems expose tool schemas).
- 🟡 Medium: P6-B NSFW cross-links, P6-C, P6-D character/agentic, P6-F emergent.
- 🟠 Low: G35 Voice↔Growth, G41 InnerMonologue.
- **Pulled to 0.1.0 (2026-08-15):** G38 Proactive↔Memory, G39 Proactive↔TimeScale, G40 Keyphrase↔Chat — matrix agentic addendum rated them "Quick win (0.1.0)"; all three tickets exist (`TASK-proactive-messaging`, `TASK-quiet-hours`, `TASK-keyphrase-recall`).
- G18–G20 (candidates 13–15) fold into existing actor/npc/memory/world epics — no new epic per `epic-platform-research.md` Open Q5.

---

## priority-release-010.md

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
- **`bun run check` gate green (2026-08-14)** — lint-ts closed; dprint + md-lint green. Gate has since regressed (size-strict + schema-manifest episodes) — see the size-strict ceiling below; the build-integrity cluster closed 2026-09-03 and is no longer part of this picture. Gate must be green again before A9.
- **e2e browser suite stable ✅ (2026-08-14)** — `test:e2e:browser` green across two
  consecutive runs (`e2e-stabilization` worktree: raised setup budgets, page-load
  timeouts, `ctx?.close()` guard).
- **No committed-state-only gates** — GM role runtime effect ✅ committed on `dev`
  (2026-08-07+); no remaining "works locally" claims.

### Open → close (blocking release)

- [x] **Lint-ts debt** — ✅ closed 2026-08-14 (`lint-ts-debt` worktree); `bun run check` gate green. Last red gate gone.
- [ ] **Size-strict debt** — closed 2026-08-12, since regressed by growth; split-down in progress; must be back under ceiling before A9.
- [x] **Unwired/leftover close-out (A8)** — ✅ CLOSED 2026-08-18 (`49ee5c1a`) — IS1–IS7 + LoRA all wired; `bun run check` 22/22 green; targeted tests pass. See `open-debt.md` #12 + #5. LoRA stale TODO dropped (`src/generation/lora/routes/index.ts:20`, 2026-08-20).

### Hardening (before tagging, non-blocking)

- memorySection cross-actor integration test — ✅ shipped (`src/assistant/prompt/sections/memories.test.ts`)
- AUX queue M5–M6 — M5 ModerationHook safety ✅ shipped (2026-08-06); M6 AUX telemetry ✅ done (2026-08-18)
- World timeline §5.3 forward-event steering + §5.4 cross-story convergence (cluster B greenfield)
- Frontend gaps in P2-B/C/D/E (music linking, party join/leave, unified GM↔assistant view, creation wizards, avatar-gallery visibility inheritance)
- `.plan/open-items.md` — resolved: consolidated into the backlog `open.md` index (2026-08-06)

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

Remaining (2026-09-11 refresh):

- **Items 7, 8, 9 done** — in-chat asset preview ✅ (`FEAT-in-chat-asset-preview-linkage-side-panel`), creation wizards ✅ (C3), GM-guided story ✅ (P2-Da). Item 12 remainder = C7 Phases 3–4 (split/reunite + choice-card) + G2 branching UI; unified GM↔assistant view ✅ (E1).
- **Items 10, 11, 14, 15** — embeddings, asset-consistency conditioning, keyphrase recall, encounter/bestiary gen — remain parked proposals, not core-finalization scope.

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

---

## priority.md

# Priority — Workstack Index (P0–P6+)

> **Last updated:** 2026-09-10 (post-August refresh — NSFW async pipeline + consent/route-authz wiring landed, mesh encrypted-sharing landed, coverage lifts with raised waiver floors, test-isolation hardening, untriaged waves re-triaged). Index of the priority
> ladder, split by priority/phasing into tier files (2026-08-15). Tier files hold the
> detail; this index holds the status header, file map, and milestone gates.
>
> **Since 2026-08-15 refresh:** Gate C core shipped + verified on `dev` (2026-08-12) —
> memory-selection UI + C1 participant panel + recovered-features merged to `dev`
> (2026-08-14); **lint-ts + e2e gates closed 2026-08-14** (`lint-ts-debt` +
> `e2e-stabilization` worktrees → `check` 18/18, browser e2e 19/19 ×2); **GM-guided
> story (P2-Da) done**; item-systems backend wiring 10/15 + docs-reconciliation merged
> 2026-08-14; **7 more RPG services wired 2026-08-14 (`51a7bc01`)** — achievements,
> skills, npc-navigation, replayability, world-location-traits, xp-loot, combat +
> quest-engine consolidation. **Release channels synced (`dev` pushed to `origin/dev`,
> `work` pushed to `origin/work`)**. **Feature matrix items promoted to P4/P5/P6 tiers**
> (2026-08-16) — conversation branching, lorebook activation, conversation analytics,
> model comparison, generation quality metrics, lore-consistency, model capability
> registry, token budget advisor, memory access audit, prompt library expansions.
> **Sep-11 filings:** two new chat epics filed with 27 supporting tickets — `epic-chat-variants-taxonomy.md` (12 variants, taxonomy-only, no schema change) and `epic-chat-product-features.md` (15 product/UX tickets; encryption-key-rotation and ownership-transfer promoted to P0–P2 visibility in `priority-p0-p2.md`). See `priority-p3-p5.md` cluster tables + `open-untriaged.md` triage notes.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(§ P3–P5 below) · P6 → § P6 (below); finer debt → `../open.md` · Gate C ✅ (GM-guided
story P2-Da done — merged to `dev`). **Sep-10 refresh: NSFW pipeline + consent wiring landed (follow-ups closed); mesh sharing landed; coverage floors raised.**

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`priority-p0-p2.md`](#priority-p0-p2md) | **P0–P2** — critical path, high priority, accessibility, core workstream (VN/chat/assistant/GM/auth/gallery/character/world) + tier details |
| [`priority-p3-p5.md`](#priority-p3-p5md) | **P3–P5** — 0.1.0 core foundation value tiers, core experience, wiring/search/polish |
| [`priority-p6.md`](#priority-p6md) | **P6+** — post-0.1.0 systems (RPG, Memory, Agentic — deferred, non-blocking), waves P6-0…P6-H, sequencing rationale |
| [`priority-release-010.md`](#priority-release-010md) | **Post-P3 → 0.1.0** — road to happy 0.1.0, release artifacts, hardening, 0.1.0 Quick Wins (emergent-platform analysis) |
| [recommendation-search-rag-capabilities-no-new-epic](#recommendation-search-rag-capabilities-no-new-epicmd) | |

`../open.md` holds in-flight/debt/unwired/deferred queues — see `../open.md` index.

## Milestone Gates

| Gate   | Trigger | Criteria                                                                                                       | Status |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Gate A | Post-P0 | Observability + testing stable; Data Integrity 1; NSFW moderation live; shared schemas enforced                | ✅     |
| Gate B | Post-P1 | Import/Export + Admin with encryption; NSFW + Battle integrations; Data Integrity 2; memory tiers + cross-chat | ✅     |
| Gate C | Post-P2 | VN wired; chat functional; assistant + tool calling; GM flows; GM-guided story; auth/access; gallery usable    | ✅ **All core ✅ + GM-guided story (P2-Da) done 2026-08-14** — Gate C complete |
| Gate D | Post-P3 | P3–P5 value tiers operational; P6+ non-blocking                                                                | ⬜     |

## Search/RAG capabilities — execution order (per TASK-search-rag-coverage-bridge.md)

Decision (2026-09-07, recorded here 2026-10-04): no new epic — six tickets filed under existing epics.
Execution order: 1. `TASK-assistant-tool-injection-guard` (defines CapabilityTag) → 2. `TASK-search-service-unified` (SearchMode; In Progress — `src/search/`, `message_search_tokens`, `/api/assets/search` backend landed) → 3. `TASK-gallery-fuzzy-search-pagination` → 4. `TASK-assistant-capability-disclosure` → 5. `TASK-admin-assistant-tooling-allowlist` → 6. `TASK-rag-search-robots-quota` (independent of 1–5). Full rationale: [recommendation-search-rag-capabilities-no-new-epic.md](#recommendation-search-rag-capabilities-no-new-epicmd).

---

## recommendation-search-rag-capabilities-no-new-epic.md

# Recommendation: Search/RAG Capabilities — No New Epic

**Decision (2026-09-07, recorded 2026-10-04):** the user's 7-item search/RAG/capabilities scope does NOT get a new epic. Six implementation tickets are filed under existing epics; this file records the bridge decision per `TASK-search-rag-coverage-bridge.md`.

## Concern → epic → ticket

| Concern | Existing epic | Ticket |
|---|---|---|
| Unified search service (DB / rg / BM25 / vector / encrypted-tokens) | `epic-rag-document-processing.md` | `TASK-search-service-unified.md` |
| Gallery fuzzy search + pagination + backend sort | `epic-frontend-gallery.md` (Phase 3 Polish) | `TASK-gallery-fuzzy-search-pagination.md` |
| Assistant tool injection guard (3-layer) | `epic-assistant-gm-flows.md` | `TASK-assistant-tool-injection-guard.md` |
| Capability disclosure (`/capabilities`, prompt injection) | `epic-assistant-gm-flows.md` | `TASK-assistant-capability-disclosure.md` |
| Admin/mod frontend for tooling allowlist + ModelRole extension | `epic-byok-local-models.md` + `epic-assistant-gm-flows.md` | `TASK-admin-assistant-tooling-allowlist.md` |
| Internet search operational correctness (robots/retry/visibility) | `epic-rag-context-sources.md` | `TASK-rag-search-robots-quota.md` |

## Order of execution

1. `TASK-assistant-tool-injection-guard` — defines `CapabilityTag` + capability matrix used by later tickets.
2. `TASK-search-service-unified` — defines `SearchMode` + encrypted tokens used by gallery + RAG.
3. `TASK-gallery-fuzzy-search-pagination` — depends on (2).
4. `TASK-assistant-capability-disclosure` — depends on (1).
5. `TASK-admin-assistant-tooling-allowlist` — depends on (1) + (4).
6. `TASK-rag-search-robots-quota` — independent of (1)–(5); parallel or interleaved.

## Landing state (audited 2026-10-04)

- `TASK-search-service-unified` — In Progress: unified search module landed at `src/search/` (exact/keyword/fuzzy/vector/hybrid, per-surface providers + convenience wrappers); `message_search_tokens` created in migration `001_init.ts`; backend route `GET /api/assets/search` (`src/routes/asset-search/index.ts`) live. Assistant/RAG consumers pending.
- Gallery frontend still filters client-side (`src/frontend/pages/gallery.ts` `filterAssets`); `/api/assets/search` has no frontend consumer yet.
- Shared types: `SearchMode` landed at `src/search/types.ts` (same union the bridge planned for `src/types/search.ts` — divergent path, no per-ticket redefinitions). `Visibility`/`CapabilityTag` land with their owning tickets.
- Remaining planned tables (`documents_fts`, `document_references`, `search_robots_cache`, `search_results_cache`, `search_rate_limit_state`, `tool_capabilities`, `user_tool_allowlists`, `tool_call_audit`) ship with their owning tickets; append-only policy per `src/db/migrations/README.md`.
- The other five tickets: Not Started.

---

## security-review-2026-08-25.md

# Security Review Plan — Auth & Access Surface (2026-08-25)

> **Author:** OpenAgent security review pass (session 2026-08-25)
> **Scope reviewed:** (A) Registration & Authorization HTTP flow — `src/auth/*`, `src/routes/auth/*`, `src/middleware/auth/*`; (1) WebSocket transport auth — `src/transport/*`; (2) RBAC enforcement at route layer — `src/users/permissions.ts` + call sites; (3) Asset object-level authz — `src/assets/controller/*`, `src/assets/service/*`.
> **Source of truth:** `src/` runnable code; `.plan/` requirements. `AGENTS.md` conventions enforced.
**Status:** Done
**Status Note:** 33 tickets filed (label `security`); the six NSFW-gate
> correctness issues (`94f9a36`, `da08f1b`, `f89168b`, `4f8aeb2`, `9575d31`, `ccb8879`)
> closed on `dev` via commit `49731047` (rows removed from `open-untriaged.md`). The 8 audit
> follow-ups filed from this review were ✅ resolved 2026-09-10 — see `open-closed.md` § Retired 2026-09-18.

## Cross-review dedup notes

> Follow-up subsystem passes (db, auth/middleware, routes/validation, chat pipeline) filed their own `BUG-*` tickets — see `.plan/tickets/` + git issues; not duplicated here.

- Malformed-payload JWT ticket ⊆ `b87cc89` (`verifyJwt` claimless-valid) — close as dupe when fixing.
- getClientIp/XFF ticket ⊆ `a001848` (auth hardening) — close as dupe when fixing.
- Logout ownership ticket supersedes part of `e16fb61` (adds logout sig+ownership); keep both until fix lands.
- Auto-gen stream ticket overlaps `d14fd85` (generation error handling) — fix together.
- `/me` unsigned fallback reappears in follow-up auth pass — same root cause as `e16fb61`.

## Next review points (backlog — not yet started)

## Triage summary

| Severity | Count | Headline |
| -------- | ----- | -------- |
| CRITICAL | 2 | `/me` unverified token; `verifyJwt` claimless-valid |
| HIGH | 2 | Asset arbitrary file write; SVG stored XSS |
| MEDIUM | 9 | algo pin, XFF trust, derive non-short-circuit, maxSessions unused, `body.userId` override, RBAC matrix unused, MIME not sniffed, visibility leak, path containment |
| LOW | 11 | see Findings §LOW |

## Findings

### CRITICAL

- `src/routes/auth/session.ts:handleMe` — `handleMe` falls back to `extractUserIdFromJwt(token)` (base64 decode, **no signature check**) when `derivedUserId` is null. Global `.derive` (`src/elysia-app.ts:46`) does NOT short-circuit on auth failure → sets `userId:null` and continues. Forged `ll_token` cookie → impersonate any user on `GET /api/auth/me`. **Fix:** drop cookie fallback; `if (!derivedUserId) return unauthorized();`.
- `src/auth/jwt.ts:verifyJwt` — `jsonParseOr(payloadStr, {} as JwtPayload)` returns `{}` on parse failure; `payload.exp < now` → `undefined < now === false` → token with valid signature but empty/missing `exp` is `valid:true` with no `sub`/`sid`/`role`; missing `exp` never expires. **Fix:** treat parse failure as invalid; assert `sub`/`sid` present and `exp` finite `> now`.

### HIGH

- `src/assets/service/file-system.ts:50-53` + `src/assets/controller/upload.ts:26` — `ext = filename.split(".").pop()` keeps `/` and `..`; `storage_path = raw/ab/cd/<id>.<ext>` then `writeFileSync` → filename `a.png/../../../../tmp/x` escapes upload root → **arbitrary file write** by any authenticated uploader. **Fix:** basename + strip separators; whitelist ext `[\w]+`; assert resolved path ⊆ `uploadDir`.
- `src/assets/controller/upload.ts:50` + `serve.ts:96` — `image/*` prefix allows `image/svg+xml`; client `file.type` stored and echoed as `Content-Type` → SVG served inline → **stored XSS**. **Fix:** block `image/svg+xml` (and other scriptable types); else `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

### MEDIUM

- `src/routes/auth/register.ts:21` / `login.ts` — `Bun.password.hash(password)` uses Bun default **argon2id**; spec (`docs/spec/users-sessions.md`, `auth-middleware.md`) mandates **scrypt**; plan says bcrypt/argon2. Three-way conflict + algorithm unpinned. **Fix:** pin `{ algorithm: "argon2id", memoryCost, timeCost }`; reconcile spec.
- `src/routes/auth/shared.ts:getClientIp` — trusts `X-Forwarded-For` first hop unconditionally → spoof IP to bypass login (10/min) / register (3/hr) limiters. **Fix:** trust XFF only behind configured trusted proxy; else socket `remoteAddress`.
- `src/elysia-app.ts:46` — `.derive` non-short-circuit on auth failure (structural weakness behind `/me`). **Fix:** hard-fail required routes; expose `authenticated` flag; don't rely on per-handler null checks. (Related shim `src/middleware/elysia-auth.ts` removed — see `BUG-elysia-auth-ts-dead-shim-duplicate-logic.md`.)
- `src/config/schema` `maxSessionsPerUser` (default 10) — defined but **never enforced**; sessions inserted unbounded. **Fix:** enforce cap on insert (evict oldest) or remove config.
- `src/routes/messages/create-entity-confirm.ts:75` — `insertGeneratedEntity({ userId: body.userId ?? actorId })` → authenticated participant attributes generated entity to **arbitrary user_id** (cross-user impersonation). **Fix:** drop `body.userId`; always use authenticated `actorId`.
- `src/users/permissions.ts:33` — 24/~32 capabilities NEVER enforced anywhere; RBAC collapses to ad-hoc `owner_id===userId` + `admin.*` wildcard. **Fix:** route object ops through `requireCapability(ctx, perm, { ownerId })` or reconcile matrix to perms actually checked.
- `src/assets/controller/upload.ts:46-52` — MIME client-asserted, never content-sniffed; stored/replayed as `Content-Type` → type confusion. **Fix:** sniff magic bytes; map to allowed type; ignore client `type`.
- `src/assets/service/read.ts:84` vs `:194` — `visibilityFilter` treats `Shared` as world-readable to ANY authed user, but `canAccessAsset` requires a real `asset_shares` row → metadata leak of specifically-shared assets via `GET /api/assets`. **Fix:** Shared filter must AND with `asset_shares.shared_with_id = actorId`.
- `src/assets/service/file-system.ts:53,61,69` — `join(uploadDir, storagePath)` without containment assert (amplifies file-write). **Fix:** `path.resolve` + assert `.startsWith(uploadDir + sep)`.
- `src/middleware/auth/authenticate.ts:verifyTokenContext` — `last_seen_at` written on **every** authenticated request (unthrottled). **Fix:** throttle (≤ once / 5 min) or async queue.

### LOW

- `src/routes/auth/session.ts:handleLogout` — `extractSessionIdFromJwt` (no sig check) drives `DELETE FROM sessions WHERE id=sid`; forged token + known `sid` = logout DoS. **Fix:** verify JWT; delete only `WHERE id=sid AND user_id=payload.sub`.
- `src/routes/auth/login.ts` — bad-request / secret-missing errors return literal `"errors.badRequest"` / `"errors.serverError"` (untranslated); `register.ts` does it right. **Fix:** `t ? t("errors.badRequest") : "..."`.
- `src/auth/jwt.ts:verifyJwt` — does not assert header `alg === "HS256"` (cheap defense-in-depth). **Fix:** reject non-HS256.
- `src/routes/auth/shared.ts:setTokenCookie` — omits `Secure` outside prod; no `__Host-` prefix. **Fix:** `__Host-ll_token` + Secure + Path=/.
- `src/routes/auth/register.ts` — password ≥6 but spec ≥8; username length-only (spec wants `alphanumeric+_`); no email/display-name/terms/CAPTCHA (spec drift, TODO). **Fix:** align to spec.
- `src/frontend/alpine/transports/server.ts:35,40` — telemetry client sends localStorage `session_token` (XSS-exfiltratable, parallel to verified JWT). **Fix:** verify server-side; prefer HttpOnly cookie.
- `src/assets/service/file-system.ts:25` — `FORBIDDEN_ROOTS` only blocks exact roots + `/home` children; `/srv`, `/tmp/x` unvalidated. **Fix:** allowlist expected base; reject outside.
- `src/users/permissions.ts` `solo:["*"]` + `src/assets/service/read.ts:188` — solo role `*` bypasses all ownership in `required:false` mode (by-design footgun). **Fix:** document; never run `required:false` multi-user.
- `src/assets/service/read.ts:106,188` — asset admin-override reuses `admin.character` for all polymorphic kinds. **Fix:** dedicated `asset.admin` perm or document.
- `src/routes/auth/shared.ts` — `sessions.token_hash` stores `jwt:${sid}` (not a hash); misleading name. **Fix:** rename column or store real hash.
- `src/middleware/rate-limit.ts` — in-memory per-process limiter (resets on restart, not shared across instances). **Fix:** note for multi-instance; consider shared store.

## Positives (no action)

- `src/middleware/auth/authenticate.ts` — `verifyJwt` signature-checked; session exists+unexpired+user active; `userId=payload.sub` (full verified binding); solo only when `required===false`.
- `src/assets/controller/serve.ts` — requires verified `ctx.userId` OR valid signed URL; anonymous → 404 (no unauth read). Signed URLs: HMAC over `action:assetId:expires`, constant-time compare, expiry enforced → no replay/cross-file.
- `src/routes/chats/manage.ts`, `src/personas/*`, `src/routes/nsfw-moderation/*` — ownership/`admin.*`/`moderation.*` gates present; role server-derived (not spoofable).
- `src/transport/*` — WS is a **client** lib; no server-side WS auth surface exists → no `/me`-class bug there today.
- `src/chat/ownership.ts` — `requireChatParticipant`/`requireActorExists` guard forged ids.

## Filed tickets (git issues)

> All filed via `bun run scripts/worktree/ ticket`. Tracking label `security`.

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `e16fb61` | CRIT | `/me` trusts unverified JWT (impersonation) | session.ts, elysia-app.ts |
| `b87cc89` | CRIT | `verifyJwt` accepts claimless/malformed payload | jwt.ts |
| `e4000f4` | HIGH | Asset upload path traversal → arbitrary file write | file-system.ts, upload.ts |
| `962618b` | HIGH | SVG upload stored XSS | upload.ts, serve.ts |
| `0ce5784` | CRIT | CSP `unsafe-inline`+`unsafe-eval` defeats nonce | config/sections/headers.ts |
| `6bda93f` | CRIT | Frontend exposes `session_token` in localStorage | frontend/alpine/transports/server.ts |
| `2129b97` | CRIT | RBAC 25/30 capabilities never enforced | users/permissions.ts |
| `ef55dc7` | HIGH | Settings PATCH `t.Any` mass-assignment | routes/settings.ts |
| `fcdcefc` | HIGH | Telemetry `userId` from request body (forgeable) | routes/telemetry.ts |
| `8c992e8` | HIGH | Character edit form unescaped fields (stored XSS) | routes/views/character-edit-form.ts |
| `ac7ae01` | HIGH | Traits page unescaped `innerHTML` (stored XSS) | frontend/pages/characters-traits.ts |
| `663722a` | HIGH | Char/world prompt overrides injected as system | assistant/prompt-assembler.ts, prompt/sections/system.ts |
| `9aec25a` | HIGH | Chat history System-role injection | assistant/prompt/sections/chat-history.ts |
| `cad5904` | HIGH | Lore/persona/traits as system messages (semantic injection) | assistant/prompt/sections/lore.ts, character-traits.ts, user-persona.ts |
| `3457e6b` | HIGH | `maxTokens`/prompt array unvalidated (cost/DoS) | generation/generate-route/handler.ts, build-prompt.ts |
| `06df3a3` | MED | Defined-but-not-enforced debt (schemas, validators, config) | validation/schemas, assistant/validation.ts, config/sections/messages.ts, rpg-service-utils.ts |
| `d14fd85` | MED | Generation error-handling gaps (detector, abort, void) | generation/auto-gen/call-llm.ts, story/gm/decisions/llm.ts |
| `3691b57` | MED | Frontend sanitize fallbacks inject raw HTML | frontend/alpine/chat-generations.ts, components/chat/message-list.html |
| `a001848` | MED | Auth hardening: XFF trust, session cap, algo pin, derive short-circuit, logout verify | routes/auth/shared.ts, config/schema, elysia-app.ts, session.ts |
| `843a93c` | LOW | Auth polish: MIME sniff, visibility, last_seen, i18n, cookie, register spec, misc | routes/auth/*, assets/service/read.ts |

## Next review points (backlog — not yet started)

- ~~**(4) Input validation coverage**~~ ✅ done (filed 9f6b799 + 06df3a3)
- ~~**(5) `src/crypto/` key handling**~~ ✅ done (filed 95aacd1)
- ~~**(6) NSFW gate ordering**~~ ✅ done (filed f0683a8, 5232abe, 7ba53d1)
- ~~**(7) `src/regex/` ReDoS**~~ ✅ done (filed 5c73739, 1330c1f, 3302cdc)
- ~~**(8) DB query safety + migration drift**~~ ✅ done (filed abc8205, c5a899d)
- ~~**(9) Logging PII/secret redaction**~~ ✅ done (filed 377cf9c, 8e464f9, 714ca84)

### Round 2 — filed tickets (git issues)

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `f0683a8` | CRIT | Story/GM generation never NSFW-gated | generation/auto-gen/story-mode.ts |
| `5c73739` | CRIT | ReDoS: lore activation `RegExp` from author key | assistant/prompt/sections/lore-activation.ts |
| `5232abe` | HIGH | NSFW age gate never verified at generation | generation/auto-gen/content-hooks.ts |
| `1330c1f` | HIGH | ReDoS: config transforms `RegExp` from pattern | generation/transforms.ts |
| `377cf9c` | HIGH | Logger censor bypasses message field | logger/logger.ts |
| `8e464f9` | HIGH | Log files world-readable (0644) | logger/transports/file.ts |
| `abc8205` | HIGH | deleteChat no transaction (orphan risk) | chat/service/crud/delete.ts |
| `7ba53d1` | MED | NSFW gate gaps (performedBy, audit, misconfig, PII secret) | nsfw-moderation/actions.ts, nsfw-hook.ts, pii-redaction.ts |
| `3302cdc` | MED | Regex safety: xml-utils tag, narrative greedy | assistant/xml-utils.ts, regex/narrative.ts |
| `95aacd1` | MED | Crypto: BYO key optional/weak + PBKDF2 100k | config/sections/byo-key.ts, crypto/byok.ts |
| `9f6b799` | MED | Input validation: battle/*, emotion-avatars, query | routes/battle/*, character-emotion-avatars.ts |
| `c5a899d` | MED | DB: asset delete tx, N+1 purge, column allowlist, playthrough | assets/service/delete.ts, memory/purge.ts, db/optimistic-locking.ts |
| `714ca84` | MED | Logging: censor exact-match + error-stack path leak | logger/censors.ts, logger/logger.ts |

**Security review sweep COMPLETE.** Total tickets filed: 33 (label `security`).
Sweep covered: auth/registration flow, WS transport, RBAC enforcement, asset authz, defined-but-not-enforced audit, frontend XSS/CSP, prompt-injection/generation, input validation, crypto keys, NSFW gate, regex ReDoS, DB safety, log redaction.

**Remaining (out of original scope, lower priority):** dependency CVE scan (user-deferred — lower priority than above), ~~concurrency races~~ ✅ done, ~~test-coverage gap analysis~~ ✅ done.

### Round 3 — filed tickets (git issues)

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `67ed226` | MED | Admin handlers lack explicit `requireUserId` (fail-open structural risk) | routes/admin/*.ts |
| `53bd3e7` | LOW | Duplicate `/admin/templates` route registration, differing gates | routes/admin/templates.ts, admin-templates/* |
| `d239395` | MED | RPG XP/intimacy read-modify-write lost updates | rpg/seduction/service/skills.ts, rpg/skills/service/progression.ts, rpg/intimacy/service/actions.ts |
| `bee01ca` | MED | Solo-user cold-start race caches phantom uid | middleware/auth/solo-user.ts |
| `c8dbeab` | MED | Asset dedup TOCTOU duplicate rows + orphan files | assets/service/create.ts |
| `3a009b6` | MED | Crafting shared sync connection → database-is-locked | rpg/crafting/process.ts |
| `76d9ab4` | MED | Register username race + rate-limiter multi-instance gap | routes/auth/register.ts, middleware/rate-limit.ts |
| `e9c30c5` | HIGH | Add security regression tests for CRITICAL/HIGH bugs | test suite (meta) |

**GRAND TOTAL: 41 tickets filed** (label `security`) across the full sweep.

### Remediation priority (recommended order)

1. CRITICAL auth/core: `0ce5784` CSP · `e16fb61` /me · `b87cc89` verifyJwt · `f0683a8` NSFW gen gate · `5c73739` ReDoS lore
2. HIGH: `6bda93f` session token · `2129b97` RBAC · `5232abe` NSFW age · `1330c1f` ReDoS transforms · `377cf9c` logger censor · `8e464f9` log perms · `abc8205` deleteChat tx · `e9c30c5` regression tests
3. MEDIUM: crypto BYO · input-val battle · DB tx/N+1 · logging censor/stack · NSFW gaps · regex safety · admin requireUserId · concurrency races (d239395, bee01ca, c8dbeab, 3a009b6, 76d9ab4)
4. LOW: duplicate templates route · auth polish group · auth hardening group

**Suggested first remediation commit set (all independent, each with regression test):** `e9c30c5` (tests) → `0ce5784` → `e16fb61` → `b87cc89` → `f0683a8` → `5c73739`.

## Verification gates (post-fix)

`bun run check` (gate green) + `bun test src/` for: jwt, session, assets/upload, assets/serve, permissions, create-entity-confirm. Add regression tests for `/me` bypass + asset traversal + SVG.

