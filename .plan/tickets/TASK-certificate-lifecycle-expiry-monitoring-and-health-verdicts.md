# TASK: Certificate lifecycle expiry monitoring and health verdicts

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management.md

## Summary

Add certificate expiry/lifecycle handling: nothing today detects an expired or near-expiry cert until clients fail. Epic: epic-certificate-and-tls-management.md.

## Current state

- ensureTlsCerts (src/config/cert.ts) checks existence only, never validity/expiry; a stale 365-day self-signed pair is served forever.
- No scheduled sweep, no logging thresholds, no hookup to the shared health endpoint established by the backup/integrity reliability tickets.

## Direction

1. Parse expiry from cert.pem at startup (Bun.crypto/X509 or openssl x509 -enddate fallback) and on every load.
2. Scheduled sweep (daily): warn >=30d remaining, critical <=7d, expired = degraded verdict; publish to shared health endpoint surface (same channel as backup freshness + integrity audit verdicts).
3. ACME mode (TASK-production-tls-modes...) auto-renews; manual mode gets actionable log + health degradation telling the operator exactly which file to replace; optional pre-expiry hook command for scripted renewal.
4. Self-signed-dev mode: regeneration on natural expiry is acceptable; still record verdict.

## Acceptance criteria

- [ ] Startup parses and logs notBefore/notAfter/issuer/subject of active certs.
- [ ] Daily sweep publishes warn/critical/expired verdicts to the shared health endpoint; no duplicate health surface.
- [ ] Manual-mode operators get file-level remediation guidance in logs and health payload.
- [ ] Simulated expired cert produces degraded health verdict in a test.

