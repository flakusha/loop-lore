<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: consume-side MCP: ComfyUI Local + Blender MCP nodes-as-tools

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-agentic-integration-mcp-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Consume-side MCP scope (deliberately new vs epic-agentic-integration-mcp-acp Non-goals 'No MCP client mode'). (1) ComfyUI official Local MCP consume: turn static graphs into agent-editable ones; builds on shipped ComfyUI provider (comfyui_url + workflow library). (2) Blender MCP consume: official Blender Lab MCP server; closes generate (TripoSG/TRELLIS.2) -> edit (Blender) -> render -> multimodal-critique loop; status quo is subprocess only. Requires decided facade + scoped-credentials first; without per-op authz every consume-side tool widens blast radius. Sources: .tmp/research/external-brains/01-integrations.md, https://docs.comfy.org/development/mcp, https://www.blender.org/lab/mcp-server/.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
