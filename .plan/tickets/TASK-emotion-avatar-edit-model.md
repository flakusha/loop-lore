# TASK: Emotion Avatar Edit Model

**Status:** 🟡 Partially Unblocked (generation fallback available)
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

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] **Fallback path generates recognizable emotion variants from metadata**
