<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: music links panel sends explicit null sectionId causing 422 on every add

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-ambient-music-sfx.md
**Tags:** music

**Summary:** src/frontend/alpine/chat-music-links.ts:60 posts body {url, sectionId: null}. Route schema MusicLinkCreateBody.sectionId is OptionalId = t.Optional(t.String({format:uuid})) (src/validation/schemas/music-links.ts:24-27, primitives.ts:20) which rejects explicit null, so Elysia 422s every add; error body has no .error field so UI always shows generic failure. Fix: omit sectionId from body when null (handler already does body.sectionId ?? null at src/routes/music-links.ts:56,71). Verify: bun test src/routes/music-links.coverage.test.ts with a sectionId:null POST case.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green

## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `src/frontend/alpine/chat-music-links.ts`

- The add path posts `{ url }` only; `sectionId` is no longer sent as an explicit `null`, so the request no longer trips the `t.Optional(uuid)` schema and 422. Removed in `97e26cd02`.
