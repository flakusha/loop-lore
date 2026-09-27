<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Near-Real-Time Desktop Agent — Interactive Testing via Playwright + Web Search

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Agent Loop
**Tags:** agent, interactive, desktop, playwright, web-search, doom, application-testing, near-real-time
**Epic:** epic-recursive-self-improvement

Enable an authorized agent to interact with **arbitrary desktop-class applications** in near-real-time: web browsers (search, scrape), game UIs (Doom), native applications (form-filling, screenshot diffing). Built on Playwright (already a dev-dep) for browser targets, plus a screenshot+input harness for non-browser targets.

## Why

The existing agent loop (#5, #6, #7, #8 in `epic-recursive-self-improvement`) is **request/response** — submit a task, get a report. It doesn't cover the agent's need to **drive external applications** to test them, gather information, or perform actions. Examples surfaced in Sep-2026 work:

- **Web search jeb** — agent searches a query, reads results, follows links, scrapes content
- **Doom testing** — agent spawns the game, plays a level, validates rendering/frame-rate
- **Application smoke** — agent opens the running app in a headless browser, exercises a flow, captures screenshots

This is the "watch an agent actually do things on a desktop" layer; it complements the `giwt`-style file/patch workflow with **interactive exploration**.

## Core Features

- `src/agent/interactive/` directory:
  - `playwright-runner.ts` — wraps Playwright Chromium (already in `bun.lock` per `devDependencies`); agent submits `{ url, actions: PlaywrightAction[] }`, runner executes, streams back screenshots + console errors
  - `web-search.ts` — DuckDuckGo HTML scrape + Google News fallback (no API key); returns `{ results: Array<{ title, url, snippet }> }`; respects `robots.txt`
  - `desktop-driver.ts` — non-browser targets via `screenshot-desktop` + OS input injection (xdotool/Win32 SendInput); agent submits `{ steps: DesktopAction[] }`, runner captures screenshots before/after each step
  - `doom-runner.ts` — specialized launcher for Doom (gzdoom, prboom, chocolate-doom): spawns game with `-iwad` + demo recording, captures per-frame screenshots, validates frame-rate + pixel-diff against baseline
- All runners emit to `agent_actions` table (#9 in epic) with `action = 'interactive.session'` + metadata
- `/api/v1/agent/interactive/{runners}` routes with scope `agent:interactive`
- Streaming via SSE: each step emits `{ step, status, screenshot?: base64, metrics?: {...} }`
- Cancellation: `DELETE /api/v1/agent/interactive/:id` kills the process within 1s

## Acceptance Criteria

- [ ] Agent can POST a Playwright action sequence; runner streams screenshots back over SSE
- [ ] Web search returns 5+ results for a real query (verified end-to-end with at least one provider)
- [ ] Doom runner spawns `gzdoom` (or `prboom` if gzdoom absent), records ≥10s of gameplay, captures frame screenshots
- [ ] Desktop-driver screenshot+input round-trip works on the dev workstation (Linux x11, Wayland fallback to Xvfb)
- [ ] Cancellation cleanly tears down child process + Playwright browser
- [ ] Per-step latency budget: Playwright step ≤2s p95; Doom step ≤500ms p95 (frame capture only)
- [ ] All actions audit-logged to `agent_actions` (#9) with screenshots stored in `tree/agent-<uuid>/screenshots/`

## Files

- `src/agent/interactive/{playwright-runner,web-search,desktop-driver,doom-runner,types}.ts` — new
- `src/agent/api/interactive.ts` — new (routes)
- `src/agent/interactive/playwright-runner.test.ts` — new
- `src/agent/interactive/desktop-driver.test.ts` — new
- `src/agent/api/sandbox.ts` — extend with `agent:interactive` scope
- `tests/e2e/agent/interactive.test.ts` — new (Playwright only; Doom gated on binary presence)
- `docs/ops/agent-api.md` — document `agent:interactive` scope

## Notes / Verification

- **Playwright is already a dev-dep** per `bun.lock` (used by `tests/e2e/flows/browser/`). Reuse the existing `chromium.launch()` pattern from `browser-server.ts`; do NOT add a second browser binary.
- **Doom binaries**: `gzdoom` (preferred, OpenGL), `prboom` (software fallback), `chocolate-doom` (Win32 native). Detect via `Bun.which`; gracefully skip when absent (per existing `real-generation.test.ts:120-122` skip pattern).
- **Web search**: start with DuckDuckGo HTML (`https://html.duckduckgo.com/html/?q=...`); no API key, no rate limit issues at low QPS. Fallback to Bing (`https://www.bing.com/search?q=...`) if DDG is unreachable.
- **Sandbox**: web-search + Playwright are network-facing; require explicit `agent:interactive` scope; rate-limit 30 req/min.
- **Doom is intentionally low-stakes**: it's a deterministic single-player game; spawning it does not violate `AGENTS.md` security review (no auth tokens, no PII). But the runner still respects the agent audit log.

## Risks

- **Web search scraping** can break when providers change markup. Add a small set of selector fallbacks per provider.
- **Playwright in a long-running agent session** holds a browser process; budget per-session memory + add a 10-minute hard timeout.
- **Desktop input injection** requires elevated permissions on some OSes; document `xdotool` install for Linux, `cliclick` for macOS, native SendInput for Windows.

