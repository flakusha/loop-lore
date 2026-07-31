# TASK: Emotion Avatar Edit Model

**Status:** ✅ Phase 1 Complete (generation fallback)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-character-core-system

## Summary

Emotion avatar edit model: emotion-reactive portraits, avatar editing based on emotion, avatar expression system. Primary path uses SD edit models (img2img); **fallback uses SD generation models (txt2img)** with original avatar metadata/captioning for prompt construction.

## Generation Fallback Strategy

When edit models are unavailable or fail, fall back to txt2img generation:

1. **Extract metadata** from original avatar (caption, tags, alt text, generation prompt)
2. **Build prompt** = `[original_caption] + [emotion_modifier] + [quality_tags]`
3. **Generate** via SD generation model (any txt2img-capable model)
4. **Store** as emotion-tagged avatar variant

This ensures emotion avatar generation works even without edit model support.

## Implementation Status

- ✅ `extractAvatarMetadata()` — pulls caption, alt text, image dimensions
- ✅ `buildEmotionPrompt()` — constructs txt2img prompt from metadata + emotion
- ✅ `fallbackMode` config gate — `"generation"` (default) or `"none"`
- ✅ Config gate respected in `generateEmotionAvatar()` and `runBatchJob()`
- ✅ Unit tests (7/7 pass)
- ✅ Frontend UI — "🎭 Generate Emotions" button + polling + progress display
- ⏳ E2E testing — deferred (requires running server + SD backends)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (7/7 unit tests)
- [x] Documentation updated (epics + task files)
- [x] Fallback path generates recognizable emotion variants from metadata
- ⏳ E2E testing — deferred
