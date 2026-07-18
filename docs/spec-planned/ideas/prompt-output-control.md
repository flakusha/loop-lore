# Prompt & Output Control

Power-user layer. Inspiration: RisuAI regex/scripted injection, auto-translation.

## #6 Regex output transforms

- **Inspiration**: RisuAI (most-requested power feature)
- **What**: User-defined regex rules that restyle model output at render time — strip
  `*action*` asterisks, color narration, auto-emote, collapse whitespace.
- **Fits**: Pure frontend render pipe; no backend change.
- **Effort**: **Low**
- **Depends on**: none — self-contained. Best first-wave item.

## #7 Auto-translation layer

- **Inspiration**: RisuAI
- **What**: User chats in their language; model is trained in another. Translate input
  → model and output → user, transparently.
- **Fits**: `docs/frontend/internationalization.md` exists; add a translate middleware
  at the generation boundary.
- **Effort**: Med
- **Depends on**: translation provider, `internationalization.md`

## #8 Smart-regen transforms

- **Inspiration**: UX trend
- **What**: One-click rewrites — "shorter / longer / funnier / darker / formal" — via LLM.
- **Fits**: Reuses `/improve` command infra (`docs/spec/assistant-commands.md`).
- **Effort**: Low
- **Depends on**: assistant command parser

## #9 Prompt-template & lorebook marketplace

- **Inspiration**: SillyTavern extensions
- **What**: Community-shared prompt packs + lorebooks with ratings/versioning.
- **Fits**: `docs/frontend/chat/prompt-creation.md` + export infra.
- **Effort**: Med
- **Depends on**: export/share (`docs/frontend/chat/export.md`), plugin registry
