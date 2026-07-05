# Chat: Commands, Image Pipeline & Extras

---

## Keyboard Shortcuts

| Shortcut           | Context              | Action                                   |
| ------------------ | -------------------- | ---------------------------------------- |
| `Enter`            | Input focused        | Send message                             |
| `Shift+Enter`      | Input focused        | Newline                                  |
| `Ctrl+Enter`       | Input focused        | Send (when Enter-to-send is off)         |
| `Escape`           | Global               | Close panel / modal / cancel inline edit |
| `Up arrow`         | Input focused, empty | Edit last user message                   |
| `Left/Right arrow` | Message focused      | Swipe character message                  |
| `Ctrl+K`           | Global               | Quick search / command palette (future)  |
| `Ctrl+J`           | Message focused      | Continue partial/cancelled message       |

---

## States Summary

| State                | Where                  | Visual                                       |
| -------------------- | ---------------------- | -------------------------------------------- |
| Zero chats           | Left panel (hamburger) | "No chats yet" + New Chat button             |
| Zero messages        | Chat area              | Empty state; greeting shown if set           |
| Loading messages     | Chat area              | 3 skeleton shimmer bubbles                   |
| Error loading        | Chat area top          | Inline retry banner, cached messages visible |
| Network error (send) | Chat area              | Toast; input stays filled; button re-enables |
| Long message (800+)  | Bubble                 | "Show more / Show less" fold                 |
| AI typing            | Chat area              | Placeholder slot with dots + progress label  |
| Input disabled       | Input area             | Disabled textarea; spinner on send button    |
| Uploading file       | Toolbar                | Progress indicator on attach button          |
| Edit mode            | Bubble                 | Textarea replaces bubble; Save/Cancel        |
| Swipe variant        | Bubble                 | Counter "2/4" always visible                 |
| Generation failure   | Chat area              | Failed message slot (per error mode)         |
| Continue available   | Bubble footer          | "↳ Continue" link on partial/cancelled msg   |
| Continue in progress | Chat area              | Placeholder slot with "↳ Continuing..."      |
| Archived visible     | Chat area              | Dimmed bubbles with "Archived" tag + Restore |

---

## Group Chat (Future, Not v1)

Explicitly excluded from v1. All chats in v1 are 1:1. Group chat would introduce:

- Multiple participants (users + characters)
- Participant roles (admin, moderator, member)
- Message threading (reply-to specific messages)
- Panel freeze by admin (prevent users from manipulating story/location/assistant settings)
- The assistant as a neutral moderator/game master

No further spec defined until v1 is stable.

---

## World Background (Future)

World-location integration beyond entity linking:

- Chat references a Location within a World
- Location change mid-chat (party moves from Cave to Village)
- Location connections encoded as graph (Cave → Village → Castle)
- World lore context injected into system prompt
- Player actions contribute to world/location lore (collaborative world-building)

See [worlds.md](../worlds.md) for spec placeholder.

---

## Image Generation Pipeline

Integrated into the chat as a message tool and as an input action. The pipeline covers:

| Action         | Trigger                                                                  | Result                                                            |
| -------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **Generate**   | Input toolbar "Generate image" button, or message tool "Generate" action | New image from text prompt, attached to current or new message    |
| **Regenerate** | Message tool on an image-associated message                              | Same prompt, new image                                            |
| **Narrate**    | Message tool                                                             | Re-generate message text as descriptive narration                 |
| **Analyze**    | Message tool on image-attached message                                   | Vision model describes the image, result posted as system message |
| **Caption**    | Auto-triggered on image upload                                           | Vision model captions the image, stored as metadata               |

**Backend**: first implementation uses local sd-cpp CLI/server for image generation. Future: pluggable API backends (Stability AI, OpenAI DALL-E, etc.).

**UI indicator**: during image generation, the same generation status system applies (see [generation.md](./generation.md)) — the placeholder shows "Generating image..." with the appropriate detail level.

**Transactional pipeline**: generate → caption → attach is a single atomic operation. If any step fails, partial state is preserved:

- If caption fails after image generation, the un-captioned image is still attached to the message. A warning toast: "Caption failed — image attached without description."
- If image generation fails, the prompt text is saved as a user message (not lost), with a note "[Image generation failed]" appended.
- If analysis (narrate/analyze) fails, the original message remains unchanged.
- Retry with exponential backoff on transient errors (network timeouts, rate limits, 429s).

---

## System / Narration Messages

Additional messages can be injected into the chat to guide story development. These are:

- Rendered as centered text, no bubble, italic, secondary color
- Prefixed with "◆" or similar unobtrusive marker
- Visible to all participants
- Not editable, not deletable by non-masters
- Purpose: scene setting, time skips, environmental changes, plot hooks
- Injected by: chat master, assistant (if configured), or auto-generated by AI

These are distinct from user and character messages — they are part of the narrative framework, not the conversation itself.

---

## Display Philosophy Reminder

**Use display space wisely**. No huge gaps between elements. The message list, input area, and panels should feel compact but not cramped. The default spacing:

- Message bubbles: 12px vertical gap
- Message list padding: 16px
- Input area padding: 12px
- Panel items: 8px vertical gap
- Header elements: 8px gap between nav items
