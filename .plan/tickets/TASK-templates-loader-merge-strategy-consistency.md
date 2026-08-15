# TASK: Templates loader merge strategy consistency

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Related:** TASK-config-file-separation-domain-extraction

## Summary

Unify replace/override/extend semantics across merge.ts and template-expansion.

## Context

Merge strategy semantics (`replace` / `override` / `extend`) are inconsistent across template domains and across the two expansion paths, producing surprising config behavior.

`src/config/templates-loader/merge.ts`:

- `mergeLlmConfig` "replace" = `{ ...base, ...override }` — keeps base keys not overridden, i.e. **override semantics, not replace**. But `mergeSdConfig` "replace" drops the base entirely (true replace). Same keyword, different meaning per domain.
- `mergeLlmConfig` "extend" and "override" branches are byte-identical — the distinction is meaningless for LLM templates.

`src/config/template-expansion/expand.ts` (`expandAvatarConfig`):

- "extend" = **base wins on conflict** (only missing keys added).
- `mergeAvatarConfig` (templates-loader) "extend" = `{...base.emotions, ...override.emotions}` — **override wins**. Two files, two extend semantics for the same domain (avatar).

Result: an avatar override behaves differently depending on whether it flows through `templates-loader` or `template-expansion`.

## Acceptance Criteria

- [ ] One canonical definition of each strategy, documented in one place and shared by all template domains
  - `replace`: base discarded, only override values kept
  - `override`: shallow merge — override wins per key, base fills gaps
  - `extend`: additive — existing keys untouched (base wins), new keys added
- [ ] `mergeLlmConfig` replace actually replaces; extend ≠ override
- [ ] `mergeAvatarConfig` and `expandAvatarConfig` produce identical results for identical inputs (single source of truth for avatar merging)
- [ ] Unit tests per strategy × domain asserting exact merge output
- [ ] Docs: `configs/templates/` README (or schema doc) states the semantics
