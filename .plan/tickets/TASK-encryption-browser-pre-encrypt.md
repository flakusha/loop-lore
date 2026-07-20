# TASK: Encryption — Browser Pre-Encrypt Integration

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low–Med
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline

## Summary

Wire existing `src/frontend/browser.ts` (browser-side pre-encrypt) into the chat UI. Messages are encrypted in-browser before sending to server for true e2e.

## What Exists

- `src/frontend/browser.ts` — browser-side pre-encrypt (exists, not wired)
- `docs/frontend/encryption.md` — full spec for browser-side flow

## Design

```
User types message
  ↓
Browser-side:
  ├── Derive key from user's actor key
  ├── Encrypt message content
  └── Send encrypted payload to server
  ↓
Server stores encrypted payload (cannot decrypt)

Other participants:
  ├── Receive encrypted payload
  ├── Derive key from their actor key
  └── Decrypt in browser
```

## Tasks

- [ ] Audit `src/frontend/browser.ts` — what's implemented
- [ ] Wire into chat message send flow
- [ ] Wire into chat message receive flow
- [ ] Add key derivation in browser (Web Crypto API)
- [ ] Add encryption indicator in chat UI (lock icon)
- [ ] Handle key unavailable gracefully (show encrypted placeholder)
- [ ] Add tests: encrypt on send, decrypt on receive

## Files to Modify

- `src/frontend/browser.ts` — integration
- `src/frontend/alpine/chat.ts` — wire encrypt/decrypt
- `src/views/chat.html` — encryption indicator

## Risk

Low — browser crypto API well-supported, existing code to wire.
