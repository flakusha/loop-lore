<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Link previews (unfurl)

**Status:** open
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement.md (proposed)
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
