<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Download policy UI enforcement

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Labels:** byok, local-models, policy, browser, security
**Epic:** epic-byok-local-models.md
**Related:** FEAT-byok-local-models.md

## Summary

The policy slice (`local-model-download-policy`, uncommitted) filters blocked
models out of `GET /api/local-inference/manifest`, but `model-manager`
`downloadFromUrl` (sibling `browser-model-downloader`) still allows ad-hoc
URL downloads with optional SHA and no policy check — a direct bypass around
the admin `allowDownloads` default and per-model overrides. Downloads are
fully client-side, so enforcement must live in the UI via an advertised flag.

## Scope

- Capability endpoint (`GET /api/local-inference/capability`) exposes
  `downloadsAllowed` (and honours per-model blocks already filtered from the
  manifest).
- `model-manager`: hides/disables the direct-URL form when downloads are
  disallowed; catalog path unchanged (already policy-filtered server-side).
- Tests: gated UI states (allowed / instance-blocked); no bypass path left
  in the component (test seam: injectable capability fetch).
- Admin docs: `generation.localModels` (`allowDownloads`, per-model
  overrides) with restart-takes-effect note (policy resolves at mount time).

## Acceptance Criteria

- [ ] `allowDownloads: false` removes every download affordance in the
      manager (catalog + direct URL); `true` restores current behavior.
- [ ] Per-model override blocks only that entry; unknown ids ignored.
- [ ] Bypass covered by tests (direct-URL path gated, not just hidden).
- [ ] Coverage >= 80% on touched modules; `bun run check` green.

## Out of scope

Server-side download proxying (no server download path exists by design);
SHA policy (verify-when-present rule stays with the downloader).
