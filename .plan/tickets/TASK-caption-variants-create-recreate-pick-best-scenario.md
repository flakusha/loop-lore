# TASK: Caption variants: create/recreate/pick-best scenario

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Current caption pipeline has a single slot: /caption and POST /api/generation/caption overwrite assets.alt_text; regeneration destroys the previous caption. No variant storage, no N-candidate generation, no selection UI. Design + implement: asset_captions table (asset_id, source user/model, content, created_at, selected flag or pointer), recreate endpoint preserving history, pick-best-variant endpoint/UI in the preview modal, gallery modal showing alt_text (currently only chat media modal shows captions). Related gap noted during review 2026-08-25.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
