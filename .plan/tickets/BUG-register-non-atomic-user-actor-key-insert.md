<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: register non-atomic user-actor-key insert

**Status:** Not Started
**Priority:** high
**Effort:** Medium

## Context

Caught during post-merge audit of commit ba2871422 (register path). Three sequential DB writes can leave a user row without its actor/key counterpart on a partial failure, orphaning the account.

## Summary

POST /register runs three sequential DB writes (insertUnique(users) then insertInto(actors) then ensureActorKey) without a transaction. If step 2 or 3 throws, the users row stays committed. A retry hits insertUnique and gets 'skipped' and a 409, leaving the user orphaned: no actor, cannot log in, cannot re-register. Wrap the three writes in database.transaction().execute(async trx => {...}). Caught from post-merge audit of ba2871422.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
