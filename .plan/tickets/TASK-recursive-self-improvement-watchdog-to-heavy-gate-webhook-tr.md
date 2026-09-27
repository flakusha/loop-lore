<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Watchdog -> Heavy Gate Webhook Trigger

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** watchdog, ci, webhook, repository-dispatch, alert
**Epic:** epic-recursive-self-improvement

When watchdog detects threshold breach (5 failures in 60s), emit a `repository_dispatch` event to `.github/workflows/watchdog-gate.yml` which runs the heavy gate against `dev` HEAD + posts an alert.

## Core Features

- `src/server/watchdog/notify.ts` — on threshold breach, POST to GitHub `repository_dispatch` API (auth via `LOOP_LORE_GITHUB_TOKEN` env var)
- `.github/workflows/watchdog-gate.yml`:
  - trigger: `repository_dispatch` event `watchdog.threshold_breach`
  - runs heavy gate against `dev` HEAD
  - posts summary to admin notification channel (Slack/email via `src/notifications/`)
- `src/server/watchdog/state.ts` (from #2) triggers the notification

## Acceptance Criteria

- [ ] Threshold breach triggers `repository_dispatch` (verified via stub)
- [ ] Workflow runs heavy gate + posts alert
- [ ] Idempotent: multiple breaches within window collapse to one dispatch
- [ ] No secrets on disk (token via env var)
- [ ] Test: simulate 5 crashes, verify dispatch fires once

## Files

- `src/server/watchdog/notify.ts` — new
- `.github/workflows/watchdog-gate.yml` — new
- `src/server/watchdog/notify.test.ts` — new

## Notes / Verification

- Per `epic-resource-provision.md`, secrets are stored encrypted; this env var follows that pattern.
- Reuse `src/notifications/` webhook delivery; no new notification system.

