<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Raw JSON.parse used outside safeJson — 3 sites need audit for untrusted input handling

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-api-validation-guardrails
**Summary:** `JSON.parse` is used throughout `src/` for parsing trusted JSON (e.g., DB-stored strings that the app itself serialized). The backlog entry (2984874) flags 3 sites where `JSON.parse` may receive untrusted input. A security audit must determine whether each site needs a safe wrapper that catches malformed JSON before it propagates.
**Context:** Found 2026-08-25 security review. The 3 flagged sites need verification — some `JSON.parse` calls parse DB fields that are app-controlled (trusted), others parse user-controlled content.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** 2984874

## What

- `JSON.parse` in `src/` parses: (a) DB columns written by the app itself (trusted), (b) incoming HTTP body/header/query strings that may contain untrusted data (untrusted).
- Trusted sites: `src/chat/service/`, `src/chat/crud/`, `src/characters/` — parse `gm_config`, `story_state`, `metadata`, `quick_replies` columns written by the same app.
- The 3 flagged sites from the backlog need grep verification to identify which ones parse untrusted input. Candidates include: dynamic config loading, telemetry event data, and asset metadata.

## Why

`JSON.parse` on untrusted input can cause DoS via deeply nested objects (MAX_DEPTH), large arrays (MAX_LENGTH), or property injection. While Bun's `JSON.parse` is faster than V8's, the risk is real. A safe wrapper (`safeParseJson`) that catches syntax errors and optionally enforces depth/size limits should replace direct `JSON.parse` on any untrusted input path.

## Scope

- Grep all `JSON.parse` calls in `src/` and classify each as "trusted" (app-controlled) or "untrusted" (user-controlled input).
- For each untrusted site: add a `try/catch` with a descriptive error (no-op or typed rejection), or wrap with a `safeParseJson` helper.
- Create `src/utils/safe-json.ts` with a `safeParseJson(input: string): ParseResult` that throws on deeply nested or oversized input.
- Out of scope: replacing `JSON.parse` on trusted DB columns (no security benefit).

## Acceptance Criteria

- [ ] All `src/` files using `JSON.parse` on untrusted input have `try/catch` or use a `safeParseJson` equivalent
- [ ] `src/utils/safe-json.ts` exists with depth/size limits documented
- [ ] Grep confirms no raw `JSON.parse` on untrusted input paths remains uncaught


git issue: e7be482
