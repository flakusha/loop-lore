# TASK: Generation mock scenario provider

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-e2e-integration-testing

## Summary

Full-surface deterministic LLMProvider mock (text, tools, thinking, embeddings, streaming chunk patterns, finishReason variants, error taxonomy: ProviderError/timeout/429/5xx/mid-stream) + fake ComfyUI HTTP/WS server for SD workflow progress + canned image; registerProvider-wired so resolveProvider/callWithFailover exercise real resolution; migrate generate-route.test + e2e generation flows.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
