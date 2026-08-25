# BUG: getClientIp is untestable without a live Bun server — IP source not injectable

**Status:** ✅ Resolved (2026-08-25, worktree `fix-ratelimiter-global-bucket`)
**Priority:** medium
**Effort:** Medium

## Summary

handleLogin/handleRegister call getClientIp(request) with only the Request object; Bun's requestIP lives on server (app.server), unreachable from the pure handler. This forced the global-bucket bug to be reproduced out-of-band via a manual Bun.serve harness. Fix: pass the resolved peer IP (or an ipSource fn) as a parameter so unit tests can exercise per-IP bucketing, trustProxy allow/deny, and XFF stripping without sockets. Blocks full regression coverage for TASK-implement-per-connection-ip-sourcing-for-auth-rate-limiters.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
