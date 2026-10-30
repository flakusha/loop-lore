<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners: sweep remaining route creator-checks

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** chat-multi-ownership
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Sweep the five route surfaces the ticket-4 cutover deliberately left on
`chats.created_by` to the owners-set predicate `isChatOwner` (`src/chat/service`
barrel). Every site gates an owner capability, so all swap; no creator-semantics keep.

**Context:**

`chats.created_by` is a frozen creator record; owner authority = `chat_owners`
membership via `isChatOwner(db, chatId, userId)` from `src/chat/service` (barrel,
re-export of `owners-core`). Epic section "Follow-up: remaining route creator-checks"
lists the sites. Convention (routes stay thin): local route helpers keep the
existence + admin shape and delegate the ownership leg to the service predicate,
mirroring `src/routes/chat-sections/access.ts:29`.

Decision table (evidence: handler docstrings + guarded operations):

| file:line | decision | why |
| --- | --- | --- |
| `src/routes/invites.ts:77` (+ call sites :99/:133/:151) | swap | create/list/revoke invites are docstring-declared "owner/admin" ops; ownership leg delegated to the service predicate |
| `src/routes/story-turns.ts:38` (+ call sites :54/:113) | swap | list/get story turns are docstring-declared "chat ownership or admin/solo role" reads; helper keeps existence + admin shape, ownership leg delegated |
| `src/routes/rpg/questions.ts:49` (+ call sites :110/:165) | swap | create/list questions gate chat-scoped management ("same rule as story-turns"); answering is actor-scoped (`checkEmitterActor`, untouched); helper keeps existence + admin shape, ownership leg delegated |
| `src/routes/messages/archiving.ts:55/89/116` | swap | archive/restore/purge are message-lifecycle management ops (owner/admin per the `can("admin.chat")` leg); existence query retargeted to `id`, ownership leg delegated |
| `src/routes/story-orchestration/index.ts` (x7: :60/:79/:94/:109/:143/:177/:200) | swap (uniform) | all seven are GM-lifecycle guards (state/pause/resume/step/configure/narration/escalate) on the same `loadChat` row; each `created_by !== userId` becomes the service predicate; the five `createGm(..., chat.created_by)` caller-key args become the acting `userId` so BYO-key resolution follows the caller, not the frozen creator |

**Acceptance Criteria:**

- [x] All five sites gate on the owners set; no `created_by` authority check remains in the five files
- [x] Per-site co-owner regression test: a `chat_owners` member who is not the creator passes where the creator-check denied (invites, story-turns, rpg questions, archiving, story-orchestration)
- [x] `bun test` green on every touched suite (exact counts recorded)
- [x] `bun run check:parallel --gates "typecheck - backend,lint - eslint,wiring - check,size - check,size - strict"` green per gate

**Evidence:**

- `bun test` on the five touched suites: 75 pass / 0 fail (invites.coverage 13, story-turns 7, rpg questions 11, archiving.coverage 17, story-orchestration 27 — each includes one new `co-owner without created_by` test).
- Gate subset: `typecheck - backend` PASS, `lint - eslint` PASS (after one `padding-line-between-statements` autofix in `rpg/questions.test.ts`), `wiring - check` PASS, `size - check` PASS, `size - strict` FAIL on pre-existing untouched `src/frontend/alpine/chat-types/core.ts` (288 lines > 250 limit; outside this ticket's scope — frozen frontend).
- `rg created_by` over the five route files + orchestration helpers: zero matches; remaining `created_by` uses are the frozen record (migration backfill, insert helper seeding, service comments).
