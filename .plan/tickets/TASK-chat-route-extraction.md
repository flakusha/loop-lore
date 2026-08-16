<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extract chat business logic from routes

**Issue:** db5a19ae-d4b9-4860-9905-96036be43286
**Status:** open
**Priority:** medium
**Epic:** epic-chat-lifecycle-moderation

## Overview

Move business logic from route handlers into the service layer.

## Problem

`src/routes/chats.ts` (785 lines) and `src/routes/messages.ts` (910 lines) contain business logic that belongs in `src/chat/service.ts`. Routes should be thin HTTP adapters.

## Scope

- Extract chat creation logic into `service.ts`
- Extract message sending logic into `service.ts`
- Extract context assembly into `service.ts`
- Extract moderation checks into `service.ts`
- Routes become: parse request → call service → format response

## Acceptance Criteria

- [ ] `src/chat/service.ts` handles chat CRUD
- [ ] `src/chat/service.ts` handles message sending
- [ ] `src/routes/chats.ts` reduced to <200 lines
- [ ] `src/routes/messages.ts` reduced to <200 lines
- [ ] All existing tests pass

## Files

- `src/chat/service.ts` (modify)
- `src/routes/chats.ts` (modify)
- `src/routes/messages.ts` (modify)
