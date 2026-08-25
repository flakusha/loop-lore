# BUG: Frontend minor bugs batch

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Low-severity findings from frontend review: (1) scroll listener leak — chat-messages.ts:114-124 adds handler to #message-list without removing from replaced node; lifecycle.ts:108 only removes current node. (2) removeTempMessages (chat-send.ts:49-53,117,123) strips ALL temp-* messages on one send failure — concurrent optimistic sends lose pending UI messages. (3) empty catch in checkGenerationStatus (chat-generations.ts:114-116) swallows JSON parse errors. (4) chat-location.ts:146,181 setTimeout(2500) flag-clear not cancelled on rapid changes. (5) tickProactive (chat-proactive.ts:50-88) can fire against abandoned chat after switch. (6) a11y: icon-only close buttons lack aria-label (rename-chat-modal.html:16, media-preview-modal.html:16, archive-confirm.html:15). (7) z-index collisions: app.css:2783 raw 100 ties --z-dropdown; vn.css:625 tooltip z=60 above own modal layers. (8) breakpoint mismatch app.css:704 (767px) vs :2338 (768px). (9) build dead weight: scripts/build-frontend.mjs:60 minifies views into dist/public but runtime serves src/views directly.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
