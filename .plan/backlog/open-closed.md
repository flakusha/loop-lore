<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
  spec-vs-`src/` audit). Follow-on open: 17 broken internal markdown links
  (see § Open / next actions below).
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
Full detail: `bucket-A-security-perf-close-out-2026-09-03.md`.

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

### Audit follow-up tickets (8, open)

Filed as `TASK-audit-follow-up-*` git issues — tracked in `open-debt.md` § Audit Follow-up
Cluster. No BLOCKING issues found; all are NIT-1/LOW/MED follow-ups.
