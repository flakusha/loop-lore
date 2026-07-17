# Chat: Messages

> **This file has been split into two focused specs.**
>
> - **[message-bubbles.md](./message-bubbles.md)** — Visual spec: bubble styling, alignment, colors, max-width, avatars, grouping, markdown, media, detail levels, thinking display, system messages, variant switching, inline edit, accessibility, test fixtures.
> - **[message-actions.md](./message-actions.md)** — Actions spec: toolbars, button sets, keyboard shortcuts, mobile touch, reply threading, reactions, pinned messages, context menu, test fixtures.

Both files include implementation priority tiers (P0/P1/P2) and explicit
v1 scope callouts.

---

## Quick Reference

### Bubble Styling (P0)

| Property | User | Character |
|----------|------|-----------|
| Alignment | Right | Left |
| Background | `--accent-primary` (#f597e8) | `--bg-tertiary` (#30333b) |
| Text color | Black | `--text-primary` |
| Border radius | 10px, bottom-right 6px | 10px, bottom-left 6px |
| Max width | 75% (capped 650px) | 75% (capped 650px) |
| Avatar | Hidden | 36px circle, first in group only |

### Detail Levels (P0)

| Mode | Thinking | Actions | Stats |
|------|----------|---------|-------|
| Immersion | Hidden | Compact hamburger | Hidden |
| Basic | 💭 indicator | Compact hamburger | `i` dropdown |
| Detailed | Collapsible section | Flat button row | Inline strip |

### Priority Tiers

| Tier | Bubbles scope | Actions scope |
|------|--------------|---------------|
| P0 | Bubble styling, avatars, grouping, markdown, system messages | Copy, Remove |
| P1 | Reply threading, inline edit, variant switcher, thinking detail-level, media, keyboard shortcuts, auto-scroll | Edit, Reply, Regenerate, Continue, Keyboard shortcuts |
| P2 | Emoji reactions, pinned messages, context menu, mobile bottom sheet, "new message below" button | Pin, React, Forward, Summarize, Generate image, Narrate, Analyze, Attach asset |
