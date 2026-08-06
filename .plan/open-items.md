# Open Items

> **Purpose:** Living list of genuinely-open work not under active development in
> `immediate.md`. `immediate.md` tracks active work; `backlog.md` is the deferred
> queue; **this file is the dead-reference / open-debt tracker** that
> `backlog.md`, `roadmaps/roadmap.md`, and `future-features-plan.md` point to.
> Created 2026-08-06 to resolve the dead `.plan/open-items.md` reference.
> Items move here when they are open but not being actively driven; resolved
> rows are checked off rather than deleted.

## Security debt (open)

> From the 2026-08-06 audit round 3 (`backlog.md` header). These block a safe
> multi-user deployment and should be treated as highest priority.

| # | Item                                                                                       | Where                           | Status  | Next                                |
| - | ------------------------------------------------------------------------------------------ | ------------------------------- | ------- | ----------------------------------- |
| 1 | `message-encryption.ts` returns the AES-GCM key without auth — complete chat access bypass | `src/.../message-encryption.ts` | 🔴 Open | Gate behind `checkChatAccess`       |
| 2 | `nsfw-moderation.ts` trusts the `x-user-id` header — spoofable identity                    | `src/.../nsfw-moderation.ts`    | 🔴 Open | Resolve identity from session/JWT   |
| 3 | `worlds.ts` allows any authed user to delete public worlds                                 | `src/routes/worlds.ts`          | 🔴 Open | Enforce actor/owner check on delete |
| 4 | NSFW-moderation + NSFW route auth bypasses (4 critical total)                              | `src/routes/nsfw*`              | 🔴 Open | Unify via `requireUserId` guard     |
| 5 | 8 access-control gaps (chats/assets/worlds/locations)                                      | across `src/routes/`            | 🟡 Open | Per-route audit + guard pass        |
| 6 | Duplicate export endpoint                                                                  | `src/routes/` (import/export)   | 🟡 Open | Dedupe to one export path           |

## Dead or unwired code (open)

| # | Item                                                               | Where                           | Status  | Next                                        |
| - | ------------------------------------------------------------------ | ------------------------------- | ------- | ------------------------------------------- |
| 1 | Entire transport module is dead                                    | `src/transport/`                | 🟡 Open | Wire or drop the module                     |
| 2 | Telemetry cleanup unwired                                          | telemetry paths                 | 🟡 Open | Wire into generation/aux calls              |
| 3 | Notification prefs silent failure                                  | notifications prefs             | 🟡 Open | Surface failures instead of swallowing      |
| 4 | Dead rule `detectIntent`                                           | `src/assistant/intent.ts`       | 🟡 Open | Remove (LLM `classifyIntent` supersedes it) |
| 5 | LoRA routes unwired (wire or drop)                                 | `src/generation/lora/routes.ts` | 🟡 Open | Wire or remove module                       |
| 6 | Swipe-variant placeholder — regen row never filled by LLM pipeline | `src/chat/service.ts:1528-1638` | 🟡 Open | Confirm `chat-variants.ts` fills row; e2e   |

## Release hardening (open)

| # | Item                                                                | Where                          | Status  | Next                             |
| - | ------------------------------------------------------------------- | ------------------------------ | ------- | -------------------------------- |
| 1 | Lint-ts debt (~261 errors / 291 pre-existing files)                 | `immediate.md` L520            | 🟡 Open | Refactor tickets; gate 16/17     |
| 2 | Size-strict debt (10 files >250L)                                   | `immediate.md` L521            | 🟡 Open | Split or gate-exempt; gate 17/17 |
| 3 | e2e browser stabilization (auth redirect-loop, page-load timeouts)  | e2e suite                      | 🟡 Open | Kill the loop; fix timeouts      |
| 4 | Release artifacts (release-process, signed tag `v0.1.0`, changelog) | `docs/meta/release-process.md` | 🟡 Open | Write process; tag + notes       |

## Hardening tests / deferred clusters (open)

| # | Item                                                                      | Where                                  | Status  | Next                        |
| - | ------------------------------------------------------------------------- | -------------------------------------- | ------- | --------------------------- |
| 1 | AUX M6 telemetry (tokens/latency per AUX call)                            | AUX pipeline                           | 🟡 Open | Wire telemetry in `callAux` |
| 2 | World timeline §5.3 forward-event steering + §5.4 cross-story convergence | `src/story/timeline/world-timeline.ts` | 🟡 Open | Greenfield cluster B        |
| 3 | Avatar-gallery visibility inheritance                                     | avatar-gallery binding                 | 🟡 Open | Inherit visibility rules    |
| 4 | External music linking UI                                                 | `TASK-chat-external-music-linking.md`  | 🟡 Open | Music embed component       |

## Resolved

| # | Item                                 | Resolved      |
| - | ------------------------------------ | ------------- |
| 1 | `.plan/open-items.md` dead reference | 2026-08-06 ✅ |
