# TASK-BROWSER-E2E-UI-SURFACE-GAPS: Browser e2e — remaining untested UI surfaces

**Status:** ⚪ Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright, coverage, gap-analysis
**Epic:** epic-e2e-integration-testing
**Extends:** TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION (harness P0 + core-flow P1 — largely landed)

## Summary

Fresh gap analysis (2026-08-15) of the Playwright browser suite
(`tests/e2e/flows/browser/*.browser.ts`). The umbrella coverage-expansion task
predates the current suite size; today the suite is **18 files / 105 cases** and
already covers chat send round-trip, register, login/session, world create+invites,
settings persist, access-correctness, redirection, and Alpine state contracts.

This ticket scopes the **UI surfaces still with ZERO browser coverage** plus the
**weak spots** in covered areas, as concrete next checks to implement. It is the
"add missing pillar tests" work of `epic-e2e-integration-testing` Pillar 1, Step 3.

## Baseline (covered today)

| View/flow | Files | Depth |
| --- | --- | --- |
| chat | chat-flow, chat-send, chat-state, smoke | DOM presence, send round-trip (plaintext+SMK), Alpine contract |
| characters | characters-flow, creation-flow, smoke | load, create/import modal, detail, create-persist |
| gallery | gallery-flow, search-flow, smoke | upload-persist, filename filter |
| settings | settings-flow, smoke | display-name/theme persist, keys tab |
| worlds | worlds-flow, creation-flow, world-invites, smoke | create/edit/location, invite create+revoke |
| login/register | auth-flow, auth-session, register-flow, navigation | form, demo link, validation, redirect, logout, admin gate |
| admin | auth-session | admin access gate only |
| new-chat | navigation, smoke | form, create+redirect |
| redirection | redirection | solo + auth-required logic |
| htmx/alpine | htmx-alpine | panel toggles, Escape, toast dedup, sidebar sync, modals, page-error tracking |

## Gap A — views with NO browser coverage

| View (file) | Untested interactive logic |
| --- | --- |
| `quests.html` | quest list, active/complete, progress render, accept/update |
| `personas.html` | persona list/CRUD, assign to chat |
| `notifications.html` | notification center, read/unread, dismiss, unread badge |
| `nsfw-moderation.html` | admin-gated moderation audit view, flag/review action |
| `character-edit.html` | edit existing character fields persist (create is tested, edit is not) |
| `world-detail.html` | navigated to by worlds-flow, no content assertion |

## Gap B — feature modules with ZERO browser coverage

- **VN scene generation** (`src/frontend/vn/*`: choice-cards, scene-renderer,
  typewriter, transition-engine) — chat `visualNovel` mode; no scene render / choice
  selection / next-scene transition test.
- **Battle / RPG combat UI** (`src/battle`, `routes/battle`) — battle screen, action
  selector, log, environment; no browser test.
- **Chat sub-features**: `chat-sections`, `chat-pins`, `chat-backgrounds`,
  `chat-search`/`message-search`, `message-reactions` — API tested, UI untested.
- **Group chat** @mention parsing/render — no browser test.
- **Story** multi-LLM turns (`story-states`, `story-turns`) — no browser test.
- **Character depth**: emotion-avatars, relationships, traits, mood — no browser test.
- **RPG economy**: `trade`, `crafting`, `actor-items`, `location-explorer`,
  `world-channels` — no browser test.
- **Image-edit**, **model-comparisons**, **analytics/activity-stream**, **gm-notes**,
  **plugins UI** — no browser test.

## Gap C — weak spots in covered areas

- `chat-send`: only plaintext + SMK. No **real generation round-trip** (MockLLMProvider
  available in `helpers/server.ts`), no **streaming/status UI**, no **cancel-generation**
  verify, no **generation-failure** UI.
- Many smoke tests assert DOM **presence only** — not htmx partial-swap correctness.
- `trackPageErrors`/`assertNoPageErrors` wired in only `htmx-alpine.ts` — no console-error
  guard in the other 17 suites.
- No **i18n locale-switch effect** (settings-flow checks selectors only).
- No **responsive/mobile** viewport (fixed 1440×900).
- No **file-download (export)** browser test.
- No **404 / error-state** UI test.
- No **NSFW / age-gate** enforcement test in browser.

## Proposed next checks

### P1 — core untested views (high value, low effort)

- [ ] `quests-flow.browser.ts` — `/views/quests` loads; seeded quest renders with
      progress; create + accept updates state + persists.
- [ ] `personas-flow.browser.ts` — `/views/personas` loads; create persona; assign to
      chat; persists.
- [ ] `notifications-flow.browser.ts` — `/views/notifications` loads; mark-read; unread
      badge syncs; dismiss.
- [ ] `nsfw-moderation-flow.browser.ts` — admin-gated load (`e2eadmin`); flag/review
      action renders + persists; non-admin redirected.

### P2 — VN + chat depth (high value, medium effort)

- [ ] `vn-scene.browser.ts` — create `visualNovel` chat (need `withChat({visualNovel:true})`
      helper in `helpers/server.ts`); send → scene renders; choice cards appear; select →
      next-scene transition. Uses MockLLMProvider.
- [ ] `chat-generation.browser.ts` — real generation round-trip via MockLLM; status
      container updates; cancel button halts.
- [ ] `chat-reactions.browser.ts` — react to message; reaction renders + persists.
- [ ] `chat-pins-sections.browser.ts` — pin message; create section; UI reflects.

### P3 — breadth / regression risk

- [ ] `group-chat.browser.ts` — multi-participant; `@mention` parses + highlights.
- [ ] `character-edit.browser.ts` — edit existing character fields persist to DB.
- [ ] `i18n-switch.browser.ts` — switch locale in settings; UI strings change.
- [ ] `export-download.browser.ts` — trigger chat export; file downloads
      (content-disposition).
- [ ] `error-states.browser.ts` — force generation failure → error toast; unknown route →
      404 view.
- [ ] `responsive.browser.ts` — 375× viewport: sidebar collapses, nav usable.
- [ ] `battle-screen.browser.ts` — open battle UI; action selector + log render.
- [ ] `story-turns.browser.ts` — multi-LLM story turn renders in UI.

## Harness prereqs (extend `tests/e2e/helpers/`)

- [ ] `createChat({flags})` + `seedActor` helpers in `helpers/server.ts` for VN / group /
      persona tests (MockLLMProvider already available).
- [ ] Promote `assertNoPageErrors` to default harness; invoke in every new P1–P3 suite.
- [ ] Web-first polling (no fixed sleeps) in new suites; reuse `navigateViaHtmx` pattern.

## Acceptance

- Each new `*.browser.ts` suite is green and non-flaky across repeated runs.
- Every new suite uses `assertNoPageErrors` + web-first locators.
- Coverage report updated: every Gap A/B surface above has ≥1 green browser test.
- `bun run test:e2e:browser` stays green (no regression to existing 105 cases).
