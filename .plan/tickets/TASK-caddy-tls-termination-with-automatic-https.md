<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Caddy TLS termination with automatic HTTPS

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Replace self-signed-only TLS with Caddy reverse-proxy termination: Caddyfile for VPS (ACME auto-issue/renew) + local (internal CA), compose wiring, SERVER_TRUST_PROXY docs, public origin config for federation/redirects behind proxy, keep ensureTlsCerts as fallback. Update build-deploy.md nginx topology to Caddy.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
