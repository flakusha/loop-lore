# Personas

A persona is **your** identity in a chat — the "user" slot. Unlike a character
(which the AI plays), a persona is how the model sees _you_ when you write.
This guide covers the current web UI (sidebar → **Personas**).

## Create a persona

1. From the sidebar, open **Personas**.
2. Click **New Persona**.
3. Set:
   - **Name** (required)
   - **Avatar** (optional)
   - **Description** (optional) — who you are, how you speak, your background
4. Save.

Personas are per-user and can be set as the **default** for your chats.

## Edit or delete

- **Edit** — click a persona card to open the form.
- **Delete** — click the 🗑 button on a persona card. Deleting is permanent.

## Use a persona

Select a persona when starting a new chat, or switch the active persona under
your chat's settings. The model then addresses you according to that persona's
name, avatar, and description.

## Persona vs Character

|               | Character                         | Persona               |
| ------------- | --------------------------------- | --------------------- |
| **Who plays** | AI generates responses            | You type the messages |
| **AI fields** | Yes (personality, system prompt…) | No (just identity)    |
| **Shareable** | Yes (export/import)               | No (per-user)         |
| **Used in**   | Any chat                          | Only your chats       |

## Impersonation

You can temporarily **become** a character — the AI sees their name, avatar,
and personality in the "user" slot:

1. Open a chat and click the character name in the header.
2. Select **Impersonate** → choose a character.
3. The input shows "🎭 Playing as …"; stop via **Stop** in that banner.

## See Also

- [Your First Chat](/guide/first-chat)
- [Creating & Managing Characters](/guide/characters)
- [Frontend: Personas](/frontend/characters) — character/persona UI
