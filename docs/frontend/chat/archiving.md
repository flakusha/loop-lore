# Chat: Message Deletion & Archiving

Deleting a message in the tree model is a **cascade operation**. Because the LLM generates responses based on preceding context, deleting a parent message invalidates the logical basis for everything that follows in its subtree.

---

## Cascade Rule

Deleting a message marks it and ALL descendant messages as **archived**, not hard-deleted. Archiving means:

- Archived messages are hidden from the normal chat timeline
- They remain in the database with an `archived_at` timestamp
- An admin or chat master can view and un-archive them (via a "Show archived" toggle in the More menu)
- The active path is rebuilt after deletion: the timeline starts from the last un-archived ancestor

**Example** — deleting message B in this tree:

Given a tree where message A is the root, B is its child, and B has children D and E (with sibling C from the same parent as B):

- Initially: A, B, C, D, E are all visible
- User deletes B
- Result: B, C, D, and E all become archived
- A is the last visible message
- User can continue from A with a new message
- B, C, D, E are archived and recoverable

---

## Permissions

| Who            | Can delete...                                            |
| -------------- | -------------------------------------------------------- |
| Message author | Their own message (cascade archives descendants)         |
| Chat master    | Any message in their chat (cascade archives descendants) |
| Admin          | Any message in any chat (cascade archives descendants)   |
| Viewer/guest   | Cannot delete any message                                |

---

## Delete Flow (UI)

1. User clicks the remove action on a message (see [messages.md](./messages.md#message-tooling))
2. Confirmation dialog appears (see [components.md](../components.md#confirmation-dialog)):
   - Title: "Delete message?"
   - Body: "This message and [N] follow-on messages will be archived. They can be recovered by an admin."
   - Buttons: Cancel (secondary), Archive (danger)
3. On confirm: htmx DELETE to `/api/chats/:chatId/messages/:msgId?cascade=true`
4. Server returns `204 No Content`
5. Affected messages disappear from the timeline with a subtle fade-out animation
6. The chat re-renders from the last visible ancestor

---

## Restore Flow (Admin/Chat Master Only)

1. Enable "Show archived" from the More menu in the chat header
2. Archived messages appear in the timeline with a dimmed background and an "Archived" tag
3. Each archived message has a "Restore" button (restore arrow icon)
4. Clicking restore on a parent also restores its descendants (if no conflicts exist)
5. Restore is a htmx PATCH to `/api/chats/:chatId/messages/:msgId/restore`

---

## Hard Delete (Admin Only, Rare)

- The chat More menu has a "Purge archived" action that permanently removes all archived messages in the current chat
- Confirmation dialog requires typing "PURGE" to activate
- Individual hard-delete is not available in the UI — use the purge action for cleanup

---

## Rationale

Archiving instead of hard-deleting:

- Preserves the LLM context chain for debugging (nerd mode error reporting references dialog history)
- Enables undo by chat master/admin
- Avoids data loss from accidental clicks (the confirmation dialog is the guard, but archive is the safety-net)
