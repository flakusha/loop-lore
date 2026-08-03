# Ticket: Invite Code Generation System

## Description

Implement invitation code generation and validation workflow.

## Priority

high

## Related Epics

invitation-system

## Subtasks

- Generate unique invite codes
- Store codes in database
- Validate codes during join process
- Handle code expiration

## Files to Modify

- src/routes/invite.test.ts
- src/chat/join-flow.ts
- src/db/migrations/025-invite-codes.ts
