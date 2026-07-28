# TASK: ComfyUI Node Discovery

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-comfyui-plugin

## Description

Auto-detect installed ComfyUI nodes via the `/object_info` endpoint and use
this to filter available workflow templates by installed capabilities.

This is Phase 4 work (lower priority). Core templates should be built first.

## Acceptance Criteria

- [ ] `GET /object_info` call to ComfyUI server on startup
- [ ] Parse node class_types, display_names, categories
- [ ] Cache discovered nodes (refresh on config change)
- [ ] Filter templates by `required_nodes` field
- [ ] `GET /api/comfyui/nodes` route returns discovered nodes
- [ ] Frontend shows which nodes are installed/missing

## Technical Notes

- ComfyUI `/object_info` returns all available nodes with their inputs/outputs
- Node detection should handle partial availability gracefully
- Cache TTL: 5 minutes or on ComfyUI server restart
- Key nodes for editing: FLUXKontextSampler, QwenImageEdit, LoraLoader, FLUXFillSampler
