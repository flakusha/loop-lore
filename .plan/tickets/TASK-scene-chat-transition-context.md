# TASK: Scene + chat/group transition with optional context inclusion

**Epic:** epic-chat-transfer-location.md
**See also:** epic-game-frontend-scenes.md
**Status:** Open
**Priority:** High

## Scope

- Transition dialog for scene→scene and chat↔group moves: target picker,
  explicit include-context toggle (full/summary/none), preview of what
  travels; default is summary, destructive full-drop requires confirm.
- Post-transition landing state + system message recording provenance;
  failed transfer leaves source untouched.

## Acceptance

- Transition with "none" starts clean; "summary" carries digest only.
- Cancel/failed transfer loses no source messages.
