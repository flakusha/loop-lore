<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: External Inference Endpoint Provisioning

**Status:** ⬜ Open
**Priority:** high
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-routing-facade`
- `TASK-resource-provision-credential-store`
- `epic-byok-local-models.md` — BYOK local model path
- `epic-distributed-compute-sharing.md` — contributor compute
  (the sharing mirror of provisioning)

## Summary

Expose routes and UI to add, list, revoke, and test external
inference endpoints (LLM, SD/ComfyUI). Credentials are stored as
hash/wrapped references; each endpoint is bound to a quota ceiling.

## Context

`epic-byok-api-keys.md` covers LLM API keys in browser storage.
This ticket generalises the model to **any inference endpoint**
including self-hosted LLMs and ComfyUI servers, with a server-side
verifiable reference and quota enforcement via the routing facade.

## Acceptance Criteria

- [ ] Routes: `POST /api/resource/inference` (add), `GET /api/resource/inference`
  (list), `DELETE /api/resource/inference/:id` (revoke),
  `POST /api/resource/inference/:id/test` (test connectivity)
- [ ] Add endpoint: provider selector, base URL, credential input,
  quota ceiling (requests/min, tokens/min, concurrency)
- [ ] Credential hashed/wrapped before persisting; raw key never
  reaches the server
- [ ] List shows provider, prefix/label, last used, active toggle,
  quota gauge
- [ ] Test endpoint validates connectivity without consuming quota
- [ ] Revoke removes the resource record; in-flight calls complete
  via existing failover
- [ ] Frontend settings panel: "Inference Providers" section
- [ ] `TASK-resource-provision-routing-facade` invoked on every
  generation call when a resource is selected
- [ ] Fallback to platform default on revoke/quota-exceeded
- [ ] `bun run check` green
