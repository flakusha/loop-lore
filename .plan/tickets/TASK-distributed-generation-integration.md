<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Distributed generation integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-distributed-compute-sharing

## Summary

Register a "distributed" provider in src/generation/providers/registry.ts mapping GenerateRequest to a node task; wrap node result in existing GenerateResponse/ChunkEvent contract; LLM (vLLM/llama.cpp OpenAI-compat) + SD/ComfyUI workflow tasks; wire into resolveProvider/buildFailoverList/callWithFailover; config-gated low-priority failover tier.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
