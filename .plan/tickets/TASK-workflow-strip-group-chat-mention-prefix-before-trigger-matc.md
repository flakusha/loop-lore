<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow: strip group-chat mention prefix before trigger match

**Status:** ✅ Done (shipped: `stripLeadingMention` in src/group-chat/mention-parser.ts; dispatch runs slash parse, trigger match, and step fill on the stripped remainder; lone mentions fall through; addressed slash commands dispatch. Verified: dispatch integration tests.)
**Priority:** Medium
**Effort:** Medium

## Summary

Group-chat messages arrive with @actor mention prefixes (see extractMentionedActorIds in src/group-chat/mention-parser, used by src/routes/messages/post.ts). The workflow dispatch hook (src/routes/messages/command.ts) matches triggers and captures step values against raw content, so '@bot make a video' never matches and step fills store the prefix. Scope: verify group-chat post path reaches dispatchCommand, then strip/resolve the addressed mention before matchWorkflowTrigger/fillNextStep. Acceptance: group-chat trigger starts a run; step values stored without mention prefix; tests cover both.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
