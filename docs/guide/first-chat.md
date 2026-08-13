# Your First Chat

This walkthrough gets you from a fresh install to your first message with a
character. It reflects the current web UI (sidebar → **Chat** → **New Chat**).

## 1. Start the server

```bash
bun install
bun run db:migrate
bun run dev
```

Open **http://localhost:3000**. You land on the chat list. If you installed for
the first time you may need to register/log in first (see Installation).

## 2. Create a character

From the sidebar, open **Characters** → **Create Character**.

Minimum fields:

- **Name** (required)
- **Description** (required) — who they are, enough for the model to respond in character
- **Greeting** (optional but recommended) — the first message they send you

Click **Save**. You now have a character.

See [Creating & Managing Characters](/guide/characters) for fields, import, and
lorebook entries.

## 3. Start a chat with that character

1. From the sidebar, open **Characters** and click the character card.
2. You land on that character's chat list.
3. Click **+ New Chat**.
4. Give the chat a **name** (or leave it blank to auto-title).
5. Pick the **chat type** (1×1 or group) and the **chat mode** (RP / story, etc.).
6. Add participants if this is a group chat.
7. Click **Create**.

The chat opens. Your character's greeting appears as the first message.

## 4. Send your first message

Type in the input box at the bottom and press **Enter** (or click the send
button). The message is sent and the model replies as the character.

While the model is generating you'll see a status bar with elapsed time and
character count. Click **⏹ Cancel** to stop generation.

## 5. What's next

- Your **persona** is the identity you speak as — see [Personas](/guide/personas).
- Characters live in **worlds** with shared context — see [Worlds](/guide/worlds).
- Attach images/audio to chats from the **Gallery** — see [Gallery](/guide/gallery).
- Tune model, theme, and more under **Settings** — see [Settings](/guide/settings).
- Type `/help` in any chat for the built-in command list.

## Troubleshooting

- **No reply / blank response** — check the **API** tab in Settings; the model
  provider, endpoint, and key must be configured (see Settings).
- **"No characters yet"** — create one in Characters before starting a chat.
- **Chat doesn't appear** — refresh the chat list; new chats appear at the top.

## See Also

- [Installation](/guide/installation)
- [Creating & Managing Characters](/guide/characters)
- [Chat Overview](/frontend/chat/overview)
