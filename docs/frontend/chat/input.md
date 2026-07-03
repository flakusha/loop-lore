# Chat: Input Area

Fixed at bottom of the chat area. Same width boundary as the message list — the input does NOT extend beyond the centered message column. Uses the `--bg-secondary` background with a `--border-default` top separator.

---

## Text Input

Single `<textarea>` with the following behavior:

- Auto-expands from 1 line to up to 5 lines (then scrolls within the textarea)
- Placeholder: "Type a message..."
- `Enter` = send message
- `Shift+Enter` = newline
- `Ctrl+Enter` = send (alternative, for when Enter-to-send is toggled off)
- Input is NOT cleared until the server confirms the message was persisted
- On server confirmation: input clears, new message bubble appears in the list
- On server error: input stays filled, error toast appears, send button re-enables

**Chat width stability**: the textarea's expansion does NOT shift the message column width. It expands vertically only.

---

## Disabled State

When a message is being sent or the AI is responding:

- Textarea disabled, placeholder changes to "Waiting for response..."
- Send button shows a spinner, becomes non-interactive
- Attach/upload buttons remain active (uploads can happen independently)

---

## Toolbar

Arranged in a single row below or inline with the textarea.

**Left side**:

- **Attach media** button: opens native file picker (accepts image/_, application/pdf, text/_, audio/_, video/_)
  - On file selection: uploads via htmx multipart POST to `/api/assets`
  - On upload success: inserts a reference marker in the textarea at cursor position
  - On upload error: toast notification
  - Supports: images (for inline display in the message), documents (PDF, text files for personal assistant context)

- **Improve message** button (optional): sends the current textarea content to an LLM for rephrasing/improvement
  - Results appear as a diff or replacement suggestion
  - User can accept or reject
  - Future: configurable improvement style (formal, creative, concise, etc.)

- **Generate image** button: opens a small inline prompt field below the input to describe the desired image. Generates via local sd-cpp CLI/server or API. Resulting image is attached to the pending message.

**Right side**:

- **Send button** (primary style, `--accent-primary` background, arrow icon)

---

## LLM Selector

Controls which model handles the next generation. Placed as a compact dropdown near the toolbar:

**Main model selector**: dropdown showing available models for the configured provider. Default: the first/last-used model. Affects the primary chat response.

**Auxiliary model indicator** (future): a small tag showing which model handles background tasks (narration, summarization, image captioning). Not user-selectable in v1 — uses the same model as main.

v1 implementation: one model handles everything. The dropdown selects the model for the next response.

---

## Character Counter (Optional)

Below the input area, right-aligned:

- Format: "245 / 4096"
- Color changes by threshold:
  - Under 80%: `--text-tertiary` (gray)
  - 80–95%: `--accent-yellow` (amber)
  - Over 95%: `--accent-red` (red)
- Configurable in settings (default: off)

---

## Markdown Support / Highlight (Future)

Not in v1. The textarea accepts raw markdown text. Future enhancement: syntax highlighting within the textarea for bold/italic/code blocks, or a toolbar that wraps selected text in markdown syntax.

---

## Spell Check / MD Checker (Future)

Not in v1. The browser's native spellcheck is active by default (no custom implementation). Future: integration with a markdown linter or spell checker as a background service.
