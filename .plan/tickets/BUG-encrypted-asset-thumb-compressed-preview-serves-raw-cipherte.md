<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: encrypted asset thumb/compressed preview serves raw ciphertext

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/assets/controller/serve.ts:188-225 handleServeCompressed has no decryption branch; missing variant falls back to serveFile(storage_path) -> encrypted tier 'standard' (upload.ts:69-87) renders broken images; signed-url-routes.ts:112-128 never reads chatId; raw/download routes do decrypt via chatId+deriveChatKeyForChat (serve.ts:139-164,268-293). Fix: decryption path or explicit 4xx for encrypted previews.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
