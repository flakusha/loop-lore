<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Near-Real-Time Agent — Project Research + Canvas Game-Mode Playwright Testing

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Task / Agent Loop
**Tags:** agent, interactive, playwright, web-search, research, canvas, game-mode, application-testing, near-real-time, data-acquisition
**Epic:** epic-recursive-self-improvement

Close the data-acquisition loop for the recursive-self-improvement agent: give it the ability to (a) research external sources in near-real-time (web search + targeted scrape) and (b) exercise the running app's in-browser canvas game-mode via Playwright, capturing screenshots, console logs, and network traffic so feature implementations and bug fixes have grounded evidence rather than guesses. The output is structured data the agent loop (#5–#9 in the epic) consumes — not screenshots-as-artifacts.

## Why

The agent loop today (#5 router → #6 worktree spawn → #7 check stream → #8 commit + finalize → #9 audit) is **closed on the project's own sources** (file system, git, gates). It can read `src/`, run `bun run check`, and emit diffs. It cannot:

- Look up an unknown library, API, or CV-2026 advisory mid-task — every research hop is a manual step.
- Watch the canvas game-mode run — autonomous-gameplay (`epic-2d-sprite-world`, `epic-battle-ui`, `epic-battle-action-systems`, `epic-3d-generation`) is real product surface and untested by the agent today.
- Capture **what users actually see** (rendered DOM, canvas frames, console errors, network requests) when investigating a frontend bug.
- Correlate "agent committed fix X" with "user-visible behavior changed Y" — there is no observation channel.

Result: the agent works on the codebase blind to runtime behavior. This ticket gives it eyes.

## Core Features

Two pillars, one data pipeline:

### Pillar A — Project Research (`src/agent/research/`)

- `web-search.ts` — multi-provider web search; primary DuckDuckGo HTML scrape (`https://html.duckduckgo.com/html/?q=...`, no API key); fallback Bing HTML (`https://www.bing.com/search?q=...`); respects `robots.txt`; returns `{ query, results: Array<{ title, url, snippet, fetchedAt }> }`
- `page-fetch.ts` — HTTP fetch + readability-style extraction; returns `{ url, title, headings, paragraphs, codeBlocks, links }`; honors rate-limit + per-domain concurrency (4 max)
- `research-router.ts` — agent POSTs `{ query, maxResults?, includeDomains?, excludeDomains? }`; returns merged + ranked results with provenance; stores in a per-agent research cache (`tree/.tmp/agent-research/<trace_id>.json`) so the agent loop can replay the research session
- `tavily-or-jina-fallback.ts` — optional paid providers behind env-flag; off by default
- All research requests audit-logged to `agent_actions` (#9) with `action = 'research.query'`

### Pillar B — Canvas Game-Mode Playwright Runner (`src/agent/playwright/`)

- `canvas-runner.ts` — wraps Playwright Chromium (already a dev-dep); targets the loop-lore canvas game-mode routes (`/play/<worldId>`, `/play/<worldId>/scene/<sceneId>`); captures:
  - Full-page screenshots (PNG, base64)
  - Canvas frame snapshots via `page.evaluate(() => canvas.toDataURL())` at a configurable cadence (default 200ms)
  - `console` events (all levels) with `location` + `args` (serialized)
  - `pageerror` events with stack
  - Network requests/responses (method, URL, status, timing; **redact request/response bodies** for auth-bearing endpoints)
  - DOM mutations summary (mutations/sec, reflow count)
- `game-actions.ts` — typed Playwright action DSL the agent submits:
  - `{ type: 'navigate', url }` | `{ type: 'click', selector, frame? }` | `{ type: 'press', key }` | `{ type: 'fill', selector, value }` | `{ type: 'waitFor', selector|canvasFrame, timeoutMs }` | `{ type: 'assertVisible', selector, screenshot? }` | `{ type: 'snapshotCanvas' }` | `{ type: 'eval', expression }` (gated, audited)
- `canvas-runner.ts` exposes both **interactive** mode (agent drives via SSE) and **replay** mode (re-execute a recorded session for regression testing)
- All sessions audit-logged to `agent_actions` (#9) with `action = 'canvas.session'` + session metadata (URL, action count, duration, errors)

### Data Pipeline → Agent Loop

- `src/agent/data-sink/` — converts captured Playwright + research data into **agent-loop consumable inputs**:
  - `console-errors.ts` — groups console errors + page errors by stack signature; emits `{ signature, count, firstSeenAt, lastSeenAt, sampleUrls }` — directly actionable as a BUG ticket body
  - `network-anomalies.ts` — flags 4xx/5xx, slow requests (p95 > 2s), CORS failures, auth-header leaks — produces a structured report the agent can attach to its PR description
  - `canvas-regression.ts` — pixel-diff canvas snapshots against a baseline (in-house XOR + region-bbox diff in `src/utils/image-diff.ts`; upgrade to a native binding only if pixel-diff quality falls short); emits `{ changedPixels, changeRatio, regions }`
  - `research-summarize.ts` — feeds raw web-search + scrape results into the LLM-side research aggregator (model-temp = 0.0, deterministic) and writes a markdown digest to `tree/.tmp/agent-research/<trace_id>.md`
- All outputs are stored at `tree/.tmp/agent-data/<trace_id>/` with a manifest (`manifest.json`) the agent loop reads

### Routes + Scope

- `POST /api/v1/agent/research` — research router
- `POST /api/v1/agent/canvas/sessions` — open Playwright session
- `GET /api/v1/agent/canvas/sessions/:id/stream` — SSE feed
- `POST /api/v1/agent/canvas/sessions/:id/actions` — submit action(s)
- `DELETE /api/v1/agent/canvas/sessions/:id` — close session (browser + child cleanup)
- `GET /api/v1/agent/data/:trace_id` — fetch the per-trace data manifest + outputs
- New scope `agent:research` and `agent:canvas` (extend `src/agent/api/sandbox.ts`); rate-limit 30 req/min each

## Acceptance Criteria

### Pillar A — Research
- [ ] Agent POSTs a research query; receives ≥5 deduplicated results within 5s
- [ ] Page fetch extracts headings + paragraphs + code blocks from a sample article (deterministic unit test against a saved fixture)
- [ ] Research cache persists across agent check-stream chunks (same `trace_id` reuses prior results)
- [ ] `robots.txt` honored: domain disallowed returns empty result + audit-logged skip
- [ ] Optional paid providers (Tavily, Jina) gated behind env flag; off by default

### Pillar B — Canvas
- [ ] Agent opens a canvas game-mode session against a running loop-lore dev server; receives ≥3 canvas frame snapshots in 2s
- [ ] Console + pageerror events stream over SSE; errors tagged with `sessionId` + `traceId`
- [ ] Network bodies redacted for routes matching `/api/auth/*`, `/api/users/*/sessions`, `/api/keys/*` — verified by a privacy test fixture
- [ ] Action DSL covers navigate/click/press/fill/waitFor/assertVisible/snapshotCanvas/eval
- [ ] Cancellation cleanly tears down Playwright browser within 1s
- [ ] Per-step latency: navigate ≤3s p95; click/fill ≤500ms p95; canvas snapshot ≤200ms p95
- [ ] Replay mode re-executes a recorded session deterministically; pixel-diff < 0.5% on the seeded fixture

### Data Pipeline
- [ ] `console-errors.ts` groups 3 repeated errors into one signature; produces a draft BUG ticket body (markdown)
- [ ] `network-anomalies.ts` flags a 500 response + slow request as a report
- [ ] `canvas-regression.ts` produces `changedPixels` + `changeRatio` + bounded region list (no full-image blob)
- [ ] `research-summarize.ts` writes a markdown digest under `tree/.tmp/agent-research/<trace_id>.md`
- [ ] `GET /api/v1/agent/data/:trace_id` returns the manifest + links to outputs

### Cross-cutting
- [ ] All research + canvas actions audit-logged to `agent_actions` (#9) with trace_id linkage
- [ ] Privacy: no raw `user_id`, `chat_id`, API keys, or auth headers in any persisted artifact (privacy test fixture)
- [ ] Existing `bun run check` gates stay green; no new top-level deps beyond what's already declared

## Files

- `src/agent/research/{web-search,page-fetch,research-router,types}.ts` — new
- `src/agent/playwright/{canvas-runner,game-actions,types}.ts` — new
- `src/agent/data-sink/{console-errors,network-anomalies,canvas-regression,research-summarize,types}.ts` — new
- `src/agent/api/{research,canvas,data}.ts` — new (routes)
- `src/agent/api/sandbox.ts` — extend with `agent:research`, `agent:canvas` scopes
- `src/agent/research/web-search.test.ts` — new (mocked fetch)
- `src/agent/playwright/canvas-runner.test.ts` — new (mocked Playwright + saved DOM fixtures)
- `src/agent/data-sink/*.test.ts` — new
- `tests/e2e/agent/research.test.ts` — new (against live DDG HTML; skipped in CI per existing `real-generation.test.ts:120-122` pattern)
- `tests/e2e/agent/canvas.test.ts` — new (against the loop-lore dev server; gate on `playwright` binary)
- `docs/ops/agent-api.md` — document `agent:research`, `agent:canvas` scopes
- `docs/ops/agent-data-sink.md` — output format reference

## Notes / Verification

- **Playwright is already a dev-dep** per `bun.lock` (used by `tests/e2e/flows/browser/`). Reuse the existing `chromium.launch()` pattern from `browser-server.ts`; do NOT add a second browser binary.
- **Canvas frame capture**: use `page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png'))` — works on `html2canvas`-free canvases; if the canvas is WebGL-only (`/play/<worldId>` 3D mode), fall back to `page.screenshot({ clip: canvas.boundingBox() })`. Document the fallback in `docs/ops/agent-canvas.md`.
- **Game-mode routes**: the canvas surfaces live in `epic-2d-sprite-world` and `epic-3d-generation` (3D via Three.js); `epic-battle-ui` + `epic-battle-action-systems` are the battle/combat overlays. The runner must handle all of them — gate tests on which routes are reachable in the test environment.
- **Web search**: DuckDuckGo HTML (`https://html.duckduckgo.com/html/?q=...`) and Bing HTML are the keyless defaults. Add a `bun:test` fixture for the parsing logic so changes to provider markup don't break silently.
- **Research determinism**: research-summarize.ts uses `temperature: 0.0` for the digest LLM call; pin model id; log the model + prompt hash for replay.
- **Image diff**: native `image-diff` is not in `bun.lock`. Use a small in-house diff (`src/utils/image-diff.ts`) — XOR + region-bbox — to keep the dep footprint flat. Upgrade to a native binding only if pixel-diff quality falls short.
- **Replay mode**: record the action sequence + start URL; replay deterministically using `context.storageState` from the original session. Do NOT replay with a fresh state — that breaks auth-bound canvases.

## Risks

- **Web search scraping** can break when providers change markup. Add a small set of selector fallbacks per provider + a `bun test src/agent/research/web-search.test.ts` snapshot test that fails fast on layout drift.
- **Playwright in a long-running agent session** holds a browser process; budget per-session memory (default 512MB cap) + add a 10-minute hard timeout per session.
- **Network body capture** can leak secrets. The redact-list (auth routes, key routes, session routes) is the first line; add a `bun test src/agent/playwright/privacy.test.ts` that asserts no `Authorization`, `Set-Cookie`, or API-key-shaped strings survive in any persisted capture.
- **Canvas `toDataURL` requires same-origin** or the canvas must be flagged `crossOrigin = 'anonymous'`. Document the limitation; on `SecurityError`, fall back to `page.screenshot()`.
- **Research determinism** is partial: search engines personalize results. Mitigate by recording the provider + query + timestamp; for bit-exact replay, treat the digest as advisory, not ground truth.
