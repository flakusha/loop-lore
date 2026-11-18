<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: antigravity ACP flavor plus BYOK hardening and provider docs

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ship Google Antigravity as an ACP harness flavor so Gemini models are reachable through `agy acp`; harden the BYOK key path found open in review; make OpenRouter and free-tier setup possible from `configs/` and the admin UI with docs to match.

**Context:**

Review lane `.tmp/intercom/` notes: provider inventory showed OpenRouter as a preset of the openai-compatible family with no `:free` documentation, Bedrock as config-only with no adapter, and native Gemini as explicitly future work. The operator confirmed Gemini is reachable through Antigravity ACP — `agy acp` serves ACP per the Antigravity CLI docs — so the native adapter is not needed; a flavor registration is. Sealing audit: server keys seal into `secret:v1:` under the repo master key and BYOK keys use AES-256-GCM per-record salt, but BYOK writes still use the unversioned envelope, a missing server secret fails open to server-key billing with only a route-level 500 on store, and legacy plaintext rows pass through silently. Config examples carry no OpenRouter entry. Alternatives: a native Gemini adapter was rejected — ACP covers it with no new API surface. Per-user KEKs deferred — self-host only, single global secret stands.

**Acceptance Criteria:**

- [ ] `antigravity` flavor registered, probe-clean against the fake ACP fixture, ToS-gated as subscription-backed
- [ ] BYOK writes use the versioned envelope with key_version 2; boot warns loudly when BYOK is enabled without a server secret
- [ ] OpenRouter commented example in configs plus free-model notes; provider docs updated
- [ ] Tests passing

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
