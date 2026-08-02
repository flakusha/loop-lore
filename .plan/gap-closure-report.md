# Gap-closure report — P1–P6 18-item workstream

All 18 items complete and committed to `dev`, GPG-signed (agent key `E9DAF69C…`). Full `bun run typecheck` green.

## P1 — User-visible breaks
| Fix | Commit |
|---|---|
| Character edit form save/upload/remove (`saveCharacterEdit`/`uploadAvatar`/`clearAvatar` were declared-but-missing in `pages/characters.ts`) | `f096300d` |
| New-chat memory-carry persist (`ChatCreateBody`+`CreateChatParams` gain `memoryCarry`; `createChat` duplicates participant memories with `source_chat_id`) | `c5b844c7` |
| World list/search owner filter (`serveWorldsListDb`/`serveWorldsSearch` + detail not-found for non-owner) | `49d49c78`, `5a9903f6` |

## P2 — Core feature gaps
| Fix | Commit |
|---|---|
| Swipe variant creation on regenerate (`POST /api/generation/regenerate` with `messageId` → new sibling variant, `swipe_index=max+1`, idempotent, ownership/author) | `a777b590` |
| Seeded chat setup templates + admin CRUD (`seedChatSetupTemplates` at boot; POST/PUT/DELETE `/api/chat-setup-templates`, `TemplateMutationResult`) | `9619f259` |
| Ownership enforcement on character-io (4 handlers) + emotion-avatars (4 handlers) → 403 non-owner | `f0c39927` |

## P3 — Backend wiring
| Fix | Commit |
|---|---|
| Context-cut memory promotion (`context_cut` branch promotes candidates via `promoteMessagesToMemories`) | `09a451f2` |
| Removed dead `chat/memory-injection.ts` + `memory-promotion.ts` (self-referencing only) | `7de41ec2` |
| Hallucination guard tests (`detectHallucinations`: 6 tests — known/invented/unknown proper-noun cases; guard stays log-only by design) | `ff821376` |

## P4 — Group chat
| Fix | Commit |
|---|---|
| Per-listener memory isolation — already per-viewer in `memorySection` (no change needed) | — |
| Initiative decrement in `recordTurn` (score −1, floor 0, for `Initiative` strategy) + 2 tests | `30f20b7a` |
| Joinable-chat discovery + Join UI (`loadJoinableChats`/`joinChat` + Discover panel) | `d04ed2cf` |
| Chat-list filters type/status/sort (`GET /api/chats` params + filters bar + `chat-filters.ts` module) | `327ff22b` |

## P5 — Location gaps (delegated to LocationGaps, committed by me after unlocking GPG)
| Fix | Commit |
|---|---|
| Chat sectioning multi-location — `chat_sections` + `messages.section_id`; list/create/update/delete/reorder/assign API; additive over existing `current_location_id` | `aab40053` (18 files) |
| Background ↔ location sync — `chat_backgrounds` + `chat_background_assignments`; GET/POST/DELETE chat background + `/api/backgrounds`; `autoSyncChatBackground` on `PUT /api/chats/:id/location` | `aab40053` |
| Location explorer + details — `GET /api/worlds/:id/location-explorer`, `GET …/locations/:id/details`; Explore tab in world-edit (tree + detail pane) | `aab40053` |

Schema `031_chat_sections`, `032_chat_backgrounds` regenerated (`schema-core/schema/schema-manifest/insert-helpers/validation`) in `a681a974`. Verified: `src/db/` 102 pass; 3 route suites 14 pass (incl. auto-sync integration); frontend tsc+build+lint clean.

## P6 — Verification
| Item | Result |
|---|---|
| World delete-world UI button — `deleteWorld()` was orphaned; added Delete button to world-edit General tab (`worlds.delete` i18n) | `733e46e7` |
| Full check + browser suite + report | typecheck TC:0; unit 904/905; browser 51/85 (see below) |

## Verification evidence (honest caveats)
- **Typecheck:** green across the whole tree — the primary gate.
- **Unit tests:** 904/905 pass. The 1 failure — `GET /api/chats returns user's chats` expecting `total ≥ 2` — lives in `src/routes/chats.test.ts`, a file a **peer is actively editing** (unstaged); it fails on HEAD too (test-DB count shift), not from this workstream.
- **Browser e2e:** 51/85 pass; 34 failures are timeouts dominated by an **auth redirect-loop** (`/views/login?redirect=<nested login>`) plus page-load timeouts — caused by the **peer's in-flight uncommitted auth/route work** in the working tree (`elysia-app.ts` adds `nsfwModerationRoutes`, `chats.ts`, `alpine/index.ts`, untracked invitation-system files). Each feature's browser flow **passed at commit time in isolated runs** (characters 10/10, worlds 7/7, htmx-alpine 15).

## Known remaining gaps (outside the 18-item scope, follow-ups)
- **Narration pipeline** — never located in the audit; no code exists to wire.
- **Swipe-variant placeholder** is created but not yet filled by the LLM pipeline (documented follow-up beyond ticket ACs).
- **e2e chat-create/chat-flow** remain flaky while the peer's auth WIP is in flight.

## Blockers / notes
- **GPG:** passphrase cache expired mid-session; commit of `aab40053` required the user to unlock the key (done). No unsigned commits were made.
- **Peer WIP left untouched:** `elysia-app.ts`, `alpine/index.ts`, `chats.ts`/`chats.test.ts`, invitation-system untracked files — not part of this workstream, deliberately not committed.
