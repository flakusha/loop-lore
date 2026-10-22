<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Link previews (unfurl)

**Status:** Done
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement
**Type:** Feature | **Priority:** Medium | **Effort:** S

## Problem

No generic link preview (grep `opengraph|og:` clean). `music-links/url.ts`
is music-specific and must stay so. Raw URLs in chat render bare.

## Change

- Server unfurl worker: fetch ≤1MB, parse `<meta og:*>`, cache
  `link_previews { url_hash, title, desc, image, fetched_at }` as new top-level `NNN_*.ts` migration (001_init frozen; regen types/manifest) TTL 7d.
- Render card in bubble + htmx partial; never raw innerHTML (allowlist
  tags, reuse emoji-epic XSS rule). Respect NSFW/private: no fetch of
  credentialed URLs, timeout 3s, SSRF-guard private-IP block.
- Leave `music-links` untouched; generic path skips music domains.

## Acceptance

- URL message renders title/desc card; malicious HTML neutralized.
- Cache hit avoids refetch; private-IP URL refused.

**Resolved:** 2026-10-23 registry-driven close: git issue 4eb00ea (registry tip: f1cccee30 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-LINK-PREVIEWS-UNFURL done)

## Resolution

- `src/db/migrations/072_link_previews.ts` — `link_previews` cache keyed by
  sha-256 `url_hash`, 7-day TTL enforced at read time; artifacts regenerated
  via `db:sync-types`/`db:sync-manifest`.
- `src/chat/service/link-previews.ts` — `unfurlLinkPreview` (cache-first,
  `safeFetch` with 3s timeout + 1MB cap), SSRF guard `isPrivateHost`
  (loopback/private/link-local/CGNAT/.internal), music-domain exclusion,
  `parseOpenGraph` (og:* + `<title>` fallback, control-char strip + length
  caps; rendered client-side via x-text/:src only — never innerHTML).
- `src/routes/link-previews.ts` — `GET /api/chats/:id/link-preview?url=…`
  mounted in `v1/chats-surface.ts`.
- Frontend: `src/frontend/alpine/chat-link-previews.ts` (URL detection,
  deduped per-URL cache in `_linkPreviews`), card block in
  `src/components/chat/message-list.html`.
- `src/chat/music-links/` untouched; the generic path refuses music domains.
- Tests: `src/chat/service/link-previews.test.ts` (10),
  `src/routes/link-previews.test.ts` (3),
  `src/frontend/alpine/chat-link-previews.test.ts` (5).
