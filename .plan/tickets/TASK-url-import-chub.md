# TASK: URL Import from Chub.ai

**Status:** ⬜ Deferred to v2
**Priority:** Low
**Effort:** Medium
**Epic:** epic-import-export-io

## Summary

Support importing character cards directly from URLs (Chub.ai, direct links). Fetches the card from a URL, parses it, and imports like a file upload.

## Acceptance Criteria

- [ ] Import endpoint accepts URL parameter
- [ ] Fetches character card from URL (with timeout, error handling)
- [ ] Auto-detects format from URL content/extension
- [ ] Handles redirects, rate limits, private cards
- [ ] Optional: avatar/asset download from URL

## Technical Notes

- Use `fetch()` with timeout (10s default)
- Chub.ai API: `https://api.chub.ai/api/characters/{author}/{name}`
- Direct links: any URL returning a character card file
- Consider: caching, retry logic, user-agent headers
- Defer asset download to avoid unexpected bandwidth

## Files

- `src/routes/import.ts` — add URL import handler (TBD)
- `src/characters/url-fetch.ts` — URL fetcher (TBD)

## Linked Epics

- `epic-import-export-io.md`
